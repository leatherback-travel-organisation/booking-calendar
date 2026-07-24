import type { Metadata } from "next"; import { PatchQuiz } from "@/components/initiatives/patch-quiz";
export const metadata:Metadata={title:"Which adventure are you? · Patch Adventures",description:"A playful two-minute Patch Adventures trip matcher."};
export default function Page(){return <PatchQuiz/>}
