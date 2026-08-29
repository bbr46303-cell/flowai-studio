import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {fileURLToPath} from "url";
import {fal} from "@fal-ai/client";
import Razorpay from "razorpay";
import admin from "firebase-admin";

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename);
const app=express(),PORT=process.env.PORT||10000;
app.use(express.json({limit:"20mb"})); app.use(express.static(__dirname));

const FAL_KEY=process.env.FAL_KEY;
if(FAL_KEY) fal.config({credentials:FAL_KEY});

let db=null;
try{
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
 if(raw){const sa=JSON.parse(raw);if(!admin.apps.length) admin.initializeApp({credential:admin.credential.cert(sa)});db=admin.firestore();}
}catch(e){console.error("Firebase Admin init:",e.message)}

const RP_ID=process.env.RAZORPAY_KEY_ID||"",RP_SECRET=process.env.RAZORPAY_KEY_SECRET||"";
const razorpay=(RP_ID&&RP_SECRET)?new Razorpay({key_id:RP_ID,key_secret:RP_SECRET}):null;
const PLANS={Basic:{amount:99,credits:150,days:30},Pro:{amount:299,credits:600,days:30},Premium:{amount:599,credits:1500,days:30},Ultra:{amount:899,credits:null,days:365,unlimited:true}};

const generated=path.join(__dirname,"generated"); if(!fs.existsSync(generated)) fs.mkdirSync(generated,{recursive:true});
app.use("/generated",express.static(generated));
app.get("/",(q,s)=>s.sendFile(path.join(__dirname,"index.html")));
app.get("/api/health",(q,s)=>s.json({success:true,falConfigured:Boolean(FAL_KEY),firebaseConfigured:Boolean(db),razorpayConfigured:Boolean(razorpay)}));

async function auth(req,res,next){
 try{
  if(!db) return res.status(503).json({error:"Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT in Render."});
  const h=req.headers.authorization||""; if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Login required."});
  req.user=await admin.auth().verifyIdToken(h.slice(7)); next();
 }catch(e){res.status(401).json({error:"Login session invalid or expired."})}
}
async function userDoc(uid){
 const ref=db.collection("users").doc(uid),snap=await ref.get();
 if(!snap.exists){await ref.set({credits:50,unlimited:false,plan:"Free",planExpiresAt:null,createdAt:admin.firestore.FieldValue.serverTimestamp()});return {credits:50,unlimited:false,plan:"Free",planExpiresAt:null}}
 return snap.data();
}
async function saveVideo(url){
 const r=await fetch(url); if(!r.ok) throw new Error("Unable to download generated video.");
 const b=Buffer.from(await r.arrayBuffer()); if(!b.length) throw new Error("Generated video is empty.");
 const f=Date.now()+"-"+crypto.randomBytes(5).toString("hex")+".mp4";fs.writeFileSync(path.join(generated,f),b);return "/generated/"+f;
}
async function makeVideo(prompt,ratio,duration){
 if(!FAL_KEY) throw new Error("FAL_KEY is not configured on the server.");
 const frames={5:121,10:241,15:361}[duration]||121;
 const r=ratio==="9:16"?"9:16":"16:9";
 const p=prompt.trim()+". Cinematic video, smooth natural motion, realistic lighting, detailed visuals, professional camera movement, high quality.";
 const result=await fal.subscribe("fal-ai/wan/v2.2-5b/text-to-video",{input:{prompt:p,negative_prompt:"blurry, distorted, low quality, flickering, unnatural motion",num_frames:frames,frames_per_second:24,resolution:"720p",aspect_ratio:r,num_inference_steps:27,enable_safety_checker:true,enable_output_safety_checker:true,guidance_scale:3.5,shift:5,interpolator_model:"none",video_quality:"high",video_write_mode:"balanced"},logs:true});
 const url=result?.data?.video?.url;if(!url) throw new Error("FAL completed but no video URL was returned.");return saveVideo(url);
}

app.get("/api/me",auth,async(req,res)=>{const u=await userDoc(req.user.uid);res.json({success:true,name:req.user.name||req.user.email?.split("@")[0]||"User",email:req.user.email||"",...u})});

app.get("/api/history",auth,async(req,res)=>{
 const snap=await db.collection("users").doc(req.user.uid).collection("generations").orderBy("createdAt","desc").limit(20).get();
 res.json({success:true,items:snap.docs.map(d=>({id:d.id,...d.data()}))});
});

app.post("/api/generate",auth,async(req,res)=>{
 const {prompt,mode="video",ratio="16:9",duration=5}=req.body||{};
 if(!prompt?.trim()) return res.status(400).json({error:"Prompt is required."});
 if(mode!=="video") return res.status(400).json({error:"Text to Video is currently enabled."});
 const d=[5,10,15].includes(Number(duration))?Number(duration):5,cost=d,ref=db.collection("users").doc(req.user.uid);
 const u=await userDoc(req.user.uid),unlimited=Boolean(u.unlimited&&(!u.planExpiresAt||Date.now()<u.planExpiresAt));
 if(!unlimited&&Number(u.credits||0)<cost) return res.status(402).json({error:`Not enough credits. You need ${cost} credits.`});
 if(!unlimited) await ref.update({credits:admin.firestore.FieldValue.increment(-cost)});
 try{
  const url=await makeVideo(prompt,ratio,d);
  await ref.collection("generations").add({prompt:prompt.trim(),duration:d,ratio:ratio==="9:16"?"9:16":"16:9",cost:unlimited?0:cost,url,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  const after=await userDoc(req.user.uid);res.json({success:true,type:"video",url,duration:d,ratio,credits:after.credits,unlimited});
 }catch(e){if(!unlimited) await ref.update({credits:admin.firestore.FieldValue.increment(cost)}).catch(()=>{});res.status(500).json({error:e.message||"Video generation failed."})}
});

app.post("/api/create-order",auth,async(req,res)=>{
 const name=req.body?.plan,p=PLANS[name];if(!p)return res.status(400).json({error:"Invalid plan."});
 if(!razorpay)return res.status(503).json({error:"Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Render."});
 const order=await razorpay.orders.create({amount:p.amount*100,currency:"INR",receipt:"flowai_"+Date.now(),notes:{uid:req.user.uid,plan:name}});
 res.json({success:true,keyId:RP_ID,order,plan:{name,...p}});
});

app.post("/api/verify-payment",auth,async(req,res)=>{
 const {razorpay_order_id,razorpay_payment_id,razorpay_signature,plan:name}=req.body||{},p=PLANS[name];
 if(!p||!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return res.status(400).json({error:"Incomplete payment details."});
 const expected=crypto.createHmac("sha256",RP_SECRET).update(razorpay_order_id+"|"+razorpay_payment_id).digest("hex");
 if(expected!==razorpay_signature)return res.status(400).json({error:"Payment verification failed."});
 const payment=await razorpay.payments.fetch(razorpay_payment_id);
 if(payment.status!=="captured"||Number(payment.amount)!==p.amount*100)return res.status(400).json({error:"Payment is not captured or amount does not match."});
 const ref=db.collection("users").doc(req.user.uid),exp=Date.now()+p.days*86400000;
 const data={plan:name,planExpiresAt:exp,updatedAt:admin.firestore.FieldValue.serverTimestamp(),lastPaymentId:razorpay_payment_id};
 if(p.unlimited)data.unlimited=true;else{data.unlimited=false;data.credits=admin.firestore.FieldValue.increment(p.credits)}
 await ref.set(data,{merge:true});await ref.collection("payments").doc(razorpay_payment_id).set({plan:name,amount:p.amount,status:"captured",orderId:razorpay_order_id,createdAt:admin.firestore.FieldValue.serverTimestamp()});
 const u=await userDoc(req.user.uid);res.json({success:true,message:name+" plan activated successfully.",...u});
});
app.listen(PORT,"0.0.0.0",()=>console.log("FlowAI Studio running on "+PORT));
