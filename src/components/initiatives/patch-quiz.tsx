"use client";
import { useState } from "react";
import styles from "./initiative-suite.module.css";

const questions = [
  { q:"Your perfect first morning?",a:[["Train window + coffee","story,taste"],["Boots dusty before breakfast","nature,epic"],["Market colours and something sizzling","colour,taste"],["Bare feet, blue water, nowhere urgent","island,nature"]]},
  { q:"Pick the story you want to bring home.",a:[["I crossed countries by rail","story,epic"],["I saw wildlife in the wild","nature,island"],["I ate with a family I’d just met","colour,taste"],["I found my calm with brilliant women","island,story"]]},
  { q:"How adventurous is adventurous?",a:[["Beautifully balanced","taste,island"],["Give me the epic version","epic,nature"],["Culture first, with a little sweat","story,colour"],["Surprise me, but find me a good bed","colour,taste"]]},
  { q:"Choose a texture.",a:[["Carved stone and old timber","story,colour"],["Red earth and wild grass","nature,epic"],["Silk, tile and spice","colour,taste"],["Salt, sand and sun-warmed linen","island,nature"]]},
  { q:"Your travel superpower?",a:[["Curiosity","taste,story"],["Stamina","epic,nature"],["Making strangers laugh","colour,island"],["Spotting the tiny details","story,taste"]]},
  { q:"Which inconvenience can you romanticise?",a:[["A long, spectacular road","epic,nature"],["A lively market crush","colour,taste"],["A train that keeps its own time","story,epic"],["A wet swimsuit at dinner","island,nature"]]},
  { q:"Final instinct. Don’t overthink it.",a:[["Take me somewhere I’ve never considered","epic,colour"],["Feed me the real story","story,taste"],["Put me close to nature","nature,island"],["Let me properly switch off","island,colour"]]},
];
const results = {
  story:{name:"The Story Chaser",place:"Balkans by rail",url:"https://patchadventures.com.au/tour/24-day-balkans-rail-adventure/",copy:"History, layered cultures, food and folklore: you want every border crossing to add another chapter."},
  nature:{name:"The Wild-Hearted Naturalist",place:"Land of Swahili",url:"https://patchadventures.com.au/tour/land-of-swahili/",copy:"Animals, big landscapes and energetic days make you feel brilliantly alive."},
  colour:{name:"The Colour Collector",place:"Morocco",url:"https://patchadventures.com.au/tour/fifteen-day-morocco-adventure/",copy:"Markets, desert, design and women-led encounters are your kind of beautiful sensory overload."},
  island:{name:"The Island Exhaler",place:"Fiji",url:"https://patchadventures.com.au/tour/fiji-islands/",copy:"Water, community and soft adventure give you the reset you actually came for."},
  taste:{name:"The Curious Tastemaker",place:"Taiwan",url:"https://patchadventures.com.au/tour/taiwan-adventure/",copy:"Food, craft and living traditions are how you understand a place from the inside."},
  epic:{name:"The Epic Explorer",place:"The Silk Road",url:"https://patchadventures.com.au/tour/silk-road-dep-tashkent/",copy:"Remoteness, long roads and bragging-rights scale make the journey worth taking."},
} as const;
type Key=keyof typeof results;

export function PatchQuiz(){
 const [step,setStep]=useState(0); const [scores,setScores]=useState<Record<Key,number>>({story:0,nature:0,colour:0,island:0,taste:0,epic:0});
 const done=step>=questions.length; const result=(Object.entries(scores) as [Key,number][]).sort((a,b)=>b[1]-a[1])[0][0];
 function choose(keys:string){const [primary,secondary]=keys.split(",") as Key[];setScores(s=>({...s,[primary]:s[primary]+2,[secondary]:s[secondary]+1}));setStep(s=>s+1)}
 function reset(){setScores({story:0,nature:0,colour:0,island:0,taste:0,epic:0});setStep(0)}
 return <main className={styles.quizShell}><nav className={styles.quizNav}><span>Patch Adventures</span><span>Seven quick questions · one very Patchie answer</span></nav><div className={styles.quizMain}><div className={styles.quizProgress}><i style={{width:`${Math.min(100,(step/questions.length)*100)}%`}}/></div><section className={styles.quizCard} aria-live="polite">{!done?<><small>Question {step+1} of {questions.length}</small><h1>{questions[step].q}</h1><div className={styles.answers}>{questions[step].a.map(([label,key])=><button key={label} onClick={()=>choose(key)}>{label}<br/><small>Choose this →</small></button>)}</div></>:<div className={styles.result}><div><small>Your wild side says…</small><h1>{results[result].name}</h1><p><strong>{results[result].place}</strong> has your name all over it. {results[result].copy}</p><a className={styles.button} href={results[result].url} target="_blank" rel="noreferrer">See my trip ↗</a> <button className={styles.buttonGhost} onClick={reset}>Go again</button><p><small>For inspiration only. A Patchie will help confirm the trip&apos;s activity level and fit.</small></p></div><div className={styles.resultArt} aria-label={`${results[result].place} abstract travel poster`}>{results[result].place.slice(0,2).toUpperCase()}</div></div>}</section></div></main>
}
