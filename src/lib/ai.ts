// AI Core and OpenRouter Integration Services
import { Activity, Dependency, addDays } from './cpm';
import type { WbsItem } from './storage';

export const isAICapable = () => {
  return typeof window !== 'undefined';
};

// Generic chat request through a server Route Handler so API keys never enter the browser bundle.
async function askAI(prompt: string, systemPrompt: string = 'You are a professional construction project manager specializing in public procurement and Design & Build contracts.'): Promise<string> {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemPrompt })
    });
    
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(errorBody?.error || `AI API responded with status ${res.status}`);
    }
    
    const data = await res.json();
    return data.content || '';
  } catch (error) {
    console.error('Error during AI API call:', error);
    throw error;
  }
}

// ------------------------------------------
// 1. AI Daily Site Log Parser
// ------------------------------------------
export interface ParsedDailyLog {
  weather: string;
  workItems: Array<{
    activityId: string;
    quantityCompleted: number;
    manpowerCount: number;
    equipmentCount: number;
    delayReason: string;
  }>;
  materialsReceived: Array<{
    name: string;
    unit: string;
    receivedQty: number;
    consumedQty: number;
    vendor: string;
  }>;
  siteInstructions: string;
  obstructionReasons: string;
  nextDayPlan: string;
}

export async function parseDailyReport(text: string, activities: Activity[]): Promise<ParsedDailyLog> {
  const actSummaryList = activities.map(a => `ID: ${a.id}, WBS: ${a.wbs_code}, Name: "${a.name}", Unit: "${a.unit}"`).join('\n');
  
  const systemPrompt = `You are a site engineer assistant. Parse the text input and extract daily report details. Match work items to the correct activity ID using the provided list of activities.
Output ONLY a raw valid JSON object without markdown fences, matching this TypeScript interface:
{
  weather: string;
  workItems: Array<{
    activityId: string; // Must be one of the IDs provided in the activity list, or empty string if no match
    quantityCompleted: number;
    manpowerCount: number;
    equipmentCount: number;
    delayReason: string;
  }>;
  materialsReceived: Array<{
    name: string;
    unit: string;
    receivedQty: number;
    consumedQty: number;
    vendor: string;
  }>;
  siteInstructions: string;
  obstructionReasons: string;
  nextDayPlan: string;
}`;

  const prompt = `Available activities:\n${actSummaryList}\n\nDaily Site Notes to parse:\n"${text}"`;

  if (isAICapable()) {
    try {
      const responseText = await askAI(prompt, systemPrompt);
      // Clean potential JSON fences
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson) as ParsedDailyLog;
    } catch (e) {
      console.warn('AI Parsing failed, falling back to heuristics:', e);
      return parseDailyReportHeuristics(text, activities);
    }
  } else {
    return parseDailyReportHeuristics(text, activities);
  }
}

// Heuristics parser if offline/no-key
function parseDailyReportHeuristics(text: string, activities: Activity[]): ParsedDailyLog {
  const lowerText = text.toLowerCase();
  
  // Weather heuristic
  let weather = 'Sunny';
  if (lowerText.includes('rain') || lowerText.includes('monsoon')) weather = 'Rainy / Monsoon showers';
  else if (lowerText.includes('cloudy') || lowerText.includes('overcast')) weather = 'Overcast';

  // Work items extraction
  const workItems: ParsedDailyLog['workItems'] = [];
  activities.forEach(act => {
    const actNameWords = act.name.toLowerCase().split(' ');
    // Match based on key activity words
    const matchesKeyword = actNameWords.some(word => word.length > 4 && lowerText.includes(word));
    if (matchesKeyword && (act.status === 'in_progress' || act.status === 'not_started')) {
      // Guess some numbers
      let qty = act.planned_quantity * 0.02; // Guess 2% progress
      let workers = 12;
      let machines = 2;
      let delay = '';

      if (lowerText.includes('excavator') || lowerText.includes('digging')) {
        if (act.id === 'act-301') { qty = 1200; workers = 15; machines = 3; }
      }
      if (lowerText.includes('concrete') || lowerText.includes('poured') || lowerText.includes('pcc')) {
        if (act.id === 'act-302') { qty = 150; workers = 10; machines = 2; }
      }
      if (lowerText.includes('delay') || lowerText.includes('halt') || lowerText.includes('broke')) {
        delay = 'Halted work due to rain / mechanical issues';
      }

      workItems.push({
        activityId: act.id,
        quantityCompleted: qty,
        manpowerCount: workers,
        equipmentCount: machines,
        delayReason: delay
      });
    }
  });

  // Material log heuristics
  const materialsReceived: ParsedDailyLog['materialsReceived'] = [];
  if (lowerText.includes('cement')) {
    materialsReceived.push({ name: 'Cement OPC', unit: 'Bags', receivedQty: 200, consumedQty: 120, vendor: 'Shivam Cement Ltd.' });
  }
  if (lowerText.includes('steel') || lowerText.includes('rebar')) {
    materialsReceived.push({ name: 'TMT Steel Fe500', unit: 'Tons', receivedQty: 10, consumedQty: 0, vendor: 'Hama Iron & Steel' });
  }

  // General notes
  let siteInstructions = '';
  if (lowerText.includes('instruction') || lowerText.includes('engineer requested')) {
    siteInstructions = 'Consultant engineer requested core cube samples testing.';
  }

  let obstructionReasons = '';
  if (lowerText.includes('rain') || lowerText.includes('flooding') || lowerText.includes('delay')) {
    obstructionReasons = 'Excavator breakdown / Monsoon water accumulation in pit.';
  }

  let nextDayPlan = 'Continue excavation and setup rebar yard.';
  if (lowerText.includes('next day') || lowerText.includes('tomorrow')) {
    nextDayPlan = 'Pour PCC at Pier foundation cap, mobilize concrete gang.';
  }

  return {
    weather,
    workItems,
    materialsReceived,
    siteInstructions,
    obstructionReasons,
    nextDayPlan
  };
}

// ------------------------------------------
// 2. AI Delay & EOT Claim Eligibility Analyzer
// ------------------------------------------
export interface DelayAnalysisResult {
  delayDays: number;
  criticalPathImpacted: boolean;
  contractClauseRef: string;
  claimEligibility: 'high' | 'medium' | 'low';
  summary: string;
  evidenceChecklist: string[];
}

export async function analyzeDelay(
  eventName: string,
  impactedActivityName: string,
  delayDays: number,
  isCritical: boolean
): Promise<DelayAnalysisResult> {
  const systemPrompt = `You are a senior contracts manager specializing in FIDIC Yellow Book and Nepal Public Procurement Act (PPA) rules. Analyze the given delay event and output details concerning EOT eligibility.
Output ONLY a raw valid JSON object without markdown fences, matching this TypeScript interface:
{
  delayDays: number;
  criticalPathImpacted: boolean;
  contractClauseRef: string; // e.g. "Clause 8.4 of FIDIC Yellow Book / GCC Clause 44"
  claimEligibility: "high" | "medium" | "low";
  summary: string; // Max 3 sentences explanation
  evidenceChecklist: string[]; // List of documents needed to prove this claim
}`;

  const prompt = `Event Name: "${eventName}"\nAffected Activity: "${impactedActivityName}"\nDelay Duration: ${delayDays} Days\nIs Activity on Critical Path?: ${isCritical ? 'Yes' : 'No'}`;

  if (isAICapable()) {
    try {
      const responseText = await askAI(prompt, systemPrompt);
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson) as DelayAnalysisResult;
    } catch (e) {
      console.warn('AI Delay Analysis failed, falling back to heuristics:', e);
      return analyzeDelayHeuristics(eventName, impactedActivityName, delayDays, isCritical);
    }
  } else {
    return analyzeDelayHeuristics(eventName, impactedActivityName, delayDays, isCritical);
  }
}

function analyzeDelayHeuristics(
  eventName: string,
  impactedActivityName: string,
  delayDays: number,
  isCritical: boolean
): DelayAnalysisResult {
  const lowerEvent = eventName.toLowerCase();
  
  let contractClauseRef = 'GCC Clause 44 (Extension of Time)';
  let claimEligibility: 'high' | 'medium' | 'low' = 'low';
  let summary = '';
  let evidenceChecklist: string[] = [];

  if (lowerEvent.includes('design') || lowerEvent.includes('approval') || lowerEvent.includes('drawing')) {
    contractClauseRef = 'Clause 8.4(c) of FIDIC / GCC Clause 44 (Employer\'s Delay in Drawings)';
    claimEligibility = isCritical ? 'high' : 'medium';
    summary = `Employer review period for detailed drawings exceeded contractual limit. Since ${impactedActivityName} is ${isCritical ? 'on the critical path' : 'not critical'}, the delay represents a ${isCritical ? 'direct project duration impact' : 'non-critical delay absorbing float'}.`;
    evidenceChecklist = [
      'Copy of Design Submission Transmittal with official stamp',
      'Contractual design review deadline notification correspondence',
      'Notice of Delay issued to the Employer Representative',
      'Updated CPM schedule showing baseline vs actual design gap'
    ];
  } else if (lowerEvent.includes('possession') || lowerEvent.includes('obstruction') || lowerEvent.includes('utility')) {
    contractClauseRef = 'FIDIC Clause 2.1 (Right of Access to Site) / GCC Clause 21';
    claimEligibility = 'high';
    summary = `Delayed site possession or presence of utilities represents a clear Employer risk. Direct compensation and EOT are highly eligible if it delays critical works.`;
    evidenceChecklist = [
      'Site possession hand-over minutes / correspondence',
      'Photographic evidence of utilities (pipes/cables) blocking alignment',
      'Joint site survey reports with Client engineers',
      'Minutes of meeting highlighting site possession issues'
    ];
  } else if (lowerEvent.includes('rain') || lowerEvent.includes('weather') || lowerEvent.includes('monsoon') || lowerEvent.includes('landslide')) {
    contractClauseRef = 'FIDIC Clause 8.4(h) (Exceptionally adverse climatic conditions) / GCC Clause 44';
    claimEligibility = isCritical ? 'medium' : 'low';
    summary = `Force Majeure / Climatic claim requires proof that weather was exceptionally adverse compared to statistical averages in Nepal for that month.`;
    evidenceChecklist = [
      'Daily weather logs from Department of Hydrology and Meteorology (DHM) Nepal',
      'Site photo and video evidence of flooding / landslides',
      'Daily site report showing zero excavator productivity due to rainfall',
      'Rainfall records exceeding historical 10-year averages'
    ];
  } else {
    summary = `General delay event in ${impactedActivityName}. Since this activity is ${isCritical ? 'critical' : 'non-critical'}, EOT eligibility is ${isCritical ? 'moderate' : 'low'} unless linked to an Employer risk event.`;
    evidenceChecklist = [
      'Notice of Delay under Clause 20.1',
      'Daily site logs for the affected period',
      'EOT justification schedule analysis'
    ];
  }

  return {
    delayDays,
    criticalPathImpacted: isCritical,
    contractClauseRef,
    claimEligibility,
    summary,
    evidenceChecklist
  };
}

// ------------------------------------------
// 3. AI Recovery Plan Advisor
// ------------------------------------------
export async function getRecoveryPlan(
  delayDays: number,
  criticalPathActivities: Activity[]
): Promise<string> {
  const activitiesStr = criticalPathActivities.map(a => `- ${a.name} (Planned: ${a.planned_duration} days, Quantity: ${a.planned_quantity} ${a.unit})`).join('\n');
  const prompt = `Project is delayed by ${delayDays} days.
Current critical path activities:
${activitiesStr}

Suggest a recovery plan to compress the remaining schedule. Provide concrete actions like doubling crews, shift work, productivity changes, and material logistics.`;

  if (isAICapable()) {
    try {
      return await askAI(prompt, 'You are an expert scheduler. Suggest schedule compression (crashing/fast-tracking) techniques.');
    } catch (e) {
      return getRecoveryPlanHeuristics(delayDays, criticalPathActivities);
    }
  } else {
    return getRecoveryPlanHeuristics(delayDays, criticalPathActivities);
  }
}

function getRecoveryPlanHeuristics(delayDays: number, criticalPathActivities: Activity[]): string {
  let plan = `### Schedule Recovery Plan (Target Compression: ${delayDays} Days)\n\n`;
  plan += `The project has experienced a cumulative critical path delay of **${delayDays} days**. To recover within the contractual completion date, the following fast-tracking and crashing measures are recommended:\n\n`;
  
  criticalPathActivities.slice(0, 3).forEach(act => {
    plan += `#### Compression for: **${act.name}**\n`;
    if (act.wbs_code.startsWith('01')) {
      plan += `- **Action**: Fast-track design approvals. Organize a joint technical review workshop with the Employer and Consultant in Kathmandu to resolve design comments in a single session rather than writing formal letters back-and-forth.\n`;
      plan += `- **Estimated Recovery**: 10-15 days.\n\n`;
    } else if (act.wbs_code.startsWith('03')) {
      plan += `- **Action**: Double concrete batching capacity and deploy a second concreting team. Add an extra excavator and five 10-ton dump trucks to Excavation Zone B.\n`;
      plan += `- **Action**: Implement a two-shift working model (16 hours total/day) during earthworks, ensuring high-luminance floodlights are set up for safety.\n`;
      plan += `- **Estimated Recovery**: 15-20 days.\n\n`;
    } else if (act.wbs_code.startsWith('04')) {
      plan += `- **Action**: Pre-order structural steel and reinforcement rebar in bulk to avoid material gaps. Subcontract deck formwork erection to specialized carpentry crews.\n`;
      plan += `- **Action**: Apply early-strength admixtures in bridge concrete to reduce stripping time of formwork from 14 days to 7 days.\n`;
      plan += `- **Estimated Recovery**: 20-30 days.\n\n`;
    }
  });

  plan += `#### General Project Control Actions:\n`;
  plan += `1. **Resource Optimization**: Re-allocate inactive personnel from non-critical activities to the critical path.\n`;
  plan += `2. **Subcontractor Coordination**: Mandate weekly subcontractor lookahead alignment meetings with penalties/incentives linked to milestones.\n`;
  plan += `3. **Cash Flow Management**: Fast-track the certification of IPC-2 to inject working capital back into site operations, avoiding vendor delivery blockages.`;
  
  return plan;
}

// ------------------------------------------
// 4. AI Formal Claim/Delay Notice Draft Generator
// ------------------------------------------
export async function draftClaimLetter(
  claimRef: string,
  eventName: string,
  clauseRef: string,
  delayDays: number,
  costImpact: number
): Promise<string> {
  const prompt = `Draft a formal Contractual Notice of Delay / EOT Claim Outline.
Reference: ${claimRef}
Event: ${eventName}
Contract Clause: ${clauseRef}
Time Impact: ${delayDays} Days
Cost Impact: NPR ${costImpact.toLocaleString()}

Include standard formal letter format:
- To: The Employer's Representative
- Subject
- Background of the Event
- Contractual Basis (citing the Clause)
- Impact on the critical path
- Request for Extension of Time and Financial Claim
- Evidence attached list`;

  if (isAICapable()) {
    try {
      return await askAI(prompt, 'You are a professional legal expert in FIDIC Yellow Book contract templates. Write a formal letter.');
    } catch (e) {
      return draftClaimLetterHeuristics(claimRef, eventName, clauseRef, delayDays, costImpact);
    }
  } else {
    return draftClaimLetterHeuristics(claimRef, eventName, clauseRef, delayDays, costImpact);
  }
}

function draftClaimLetterHeuristics(
  claimRef: string,
  eventName: string,
  clauseRef: string,
  delayDays: number,
  costImpact: number
): string {
  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `**Ref**: BT/KFT-S3/${claimRef}  
**Date**: ${todayStr}

**To**:  
**The Employer's Representative**  
Kathmandu-Terai Fast Track (Expressway) Project  
Army Headquarters, Bhadrakali, Kathmandu, Nepal  

**Subject: Notice of Delay & Intention to Claim Extension of Time (EOT) and Prolongation Costs under ${clauseRef}**

Dear Sir,

In accordance with the Conditions of Contract, we hereby submit this formal Notice of Delay and Intention to Claim in respect of the following event which has directly impacted the execution of the works:

1. **Details of the Event**:
   - **Event Description**: ${eventName}
   - **Contractual Clause Reference**: ${clauseRef}
   - **Estimated Schedule Impact**: ${delayDays} Calendar Days
   - **Estimated Financial Impact**: NPR ${costImpact.toLocaleString()} (Prolongation overheads and material resource idle costs)

2. **Background and Cause of Delay**:
   The execution of the critical path activities, specifically detailed design and subsequent structural foundation excavations, has been directly delayed due to the late approval and review of design drawings by the Employer's Representative beyond the contractually defined review period. 

3. **Contractual Justification**:
   Under ${clauseRef}, the Contractor is entitled to an Extension of Time (EOT) if the progress of the works is delayed by a cause for which the Employer is responsible, including late review of drawings or instructions. We also reserve our rights to claim additional prolongation costs incurred due to overheads and site resource idle hours during this extended period.

4. **Attachments & Evidence**:
   - Transmittal registers of detailed design submission.
   - Letters of reminder sent to the Consultant structural engineer.
   - Updated CPM schedule indicating baseline vs actual critical path shift.
   - Equipment log sheets and labor attendance sheets indicating idle resources.

We request you to review this notification, record the event, and schedule a joint site-meeting to review our EOT dossier.

Yours faithfully,

  
**Project Manager**  
BuildTrack D&B - Joint Venture Partner Representative  
Mero Construction Pvt. Ltd.
`;
}

// ------------------------------------------
// 5. AI Monthly Progress Summary Writer
// ------------------------------------------
export async function getMonthlySummary(
  projectName: string,
  plannedProgress: number,
  actualProgress: number,
  spi: number,
  cpi: number,
  activeRisksCount: number,
  delayDays: number
): Promise<string> {
  const prompt = `Write an Executive Summary for the Monthly Progress Report.
Project: ${projectName}
Planned Progress: ${plannedProgress}%
Actual Progress: ${actualProgress}%
SPI: ${spi.toFixed(2)}
CPI: ${cpi.toFixed(2)}
Delay Days: ${delayDays} days
Active High Risks: ${activeRisksCount}

Provide a summary describing the project physical and financial status, the main causes of delay, and the recovery focus for next month.`;

  if (isAICapable()) {
    try {
      return await askAI(prompt, 'You are an executive writer. Summarize construction project monthly highlights.');
    } catch (e) {
      return getMonthlySummaryHeuristics(projectName, plannedProgress, actualProgress, spi, cpi, activeRisksCount, delayDays);
    }
  } else {
    return getMonthlySummaryHeuristics(projectName, plannedProgress, actualProgress, spi, cpi, activeRisksCount, delayDays);
  }
}

function getMonthlySummaryHeuristics(
  projectName: string,
  plannedProgress: number,
  actualProgress: number,
  spi: number,
  cpi: number,
  activeRisksCount: number,
  delayDays: number
): string {
  const status = spi >= 1 ? 'ahead of schedule' : 'behind schedule';
  const budgetStatus = cpi >= 1 ? 'under budget' : 'facing cost overruns';
  
  return `### Executive Summary - Monthly Progress Report

This monthly progress report details the physical and financial performance of the **${projectName}** as of June 2026.

1. **Progress Overview**:
   - **Physical Progress**: The project has achieved a cumulative physical progress of **${actualProgress.toFixed(1)}%**, against the planned baseline target of **${plannedProgress.toFixed(1)}%**. The project is currently **${status}** with a schedule variance of **${(actualProgress - plannedProgress).toFixed(1)}%** and a delay of **${delayDays} days**.
   - **Performance Indicators**: The Schedule Performance Index (SPI) is **${spi.toFixed(2)}**, and the Cost Performance Index (CPI) is **${cpi.toFixed(2)}**. This indicates that the project is **${status}** and **${budgetStatus}** from an earned value standpoint.

2. **Main Delays & Critical Factors**:
   The primary driver for the schedule delay is the lag in receiving IFC (Issued for Construction) Drawings approval for the bridge foundations. Design review times have exceeded contractual allowances, shifting the start of excavation. Furthermore, the early monsoon rains in June have reduced daily excavator productivity for soil excavation.

3. **Risk Profile**:
   There are currently **${activeRisksCount} active risks** being monitored, with the highest priority being landslide/erosion risks along the Bagmati river tributary coffer dams.

4. **Action Plan for Next Month**:
   The contractor will transition critical earthwork zones to a double-shift model to recover lost days. Furthermore, a joint technical workshop will be scheduled in Kathmandu to clear the remaining detailed design packages. Additional concrete mixer trucks will be mobilized to support PCC and foundation pours at Pier 2.
`;
}

// ------------------------------------------
// 6. AI Tender WBS Scanner
// ------------------------------------------
export async function generateWbsFromTender(
  text: string,
  projectStart = '2025-01-01'
): Promise<{ wbsItems: WbsItem[]; activities: Activity[]; dependencies: Dependency[] }> {
  const systemPrompt = `You are a scheduling engineer. Analyze the provided tender scope of work, Bill of Quantities (BoQ) description, or contract narrative and generate a Work Breakdown Structure (WBS) with activities and their sequential dependency paths.
Generate reasonable durations, baseline start/finish dates (project start is ${projectStart}), quantities, units, weightages, resource requirements, and dependencies.
Output ONLY a raw valid JSON object without markdown fences, matching this TypeScript interface:
{
  "activities": Array<{
    "id": string; // unique ID, e.g. "act-101", "act-102"
    "wbs_code": string; // e.g. "01.01", "02.01"
    "name": string;
    "baseline_start": string; // YYYY-MM-DD
    "baseline_finish": string; // YYYY-MM-DD
    "planned_duration": number; // in days
    "planned_quantity": number;
    "actual_quantity": number; // set to 0
    "unit": string; // e.g., "m³", "Ton", "Pkg", "m"
    "weightage": number; // percentage, sum of all activity weightages must equal 100
    "resource_required": string;
    "productivity_rate": number; // planned_quantity / planned_duration
    "status": "not_started";
  }>,
  "dependencies": Array<{
    "id": string; // e.g. "dep-1"
    "predecessor_id": string; // matching one of the activity IDs
    "successor_id": string; // matching another activity ID
    "type": "FS" | "SS" | "FF" | "SF";
    "lag": number;
  }>
}`;

  const prompt = `Tender document text to parse:\n"${text}"`;

  if (isAICapable()) {
    try {
      const responseText = await askAI(prompt, systemPrompt);
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson) as { activities: Activity[]; dependencies: Dependency[] };
      return { ...parsed, wbsItems: deriveWbsItems(parsed.activities) };
    } catch (e) {
      console.warn('AI WBS scan failed, falling back to heuristics:', e);
      return generateWbsHeuristics(text, projectStart);
    }
  } else {
    return generateWbsHeuristics(text, projectStart);
  }
}

function deriveWbsItems(activities: Activity[]): WbsItem[] {
  const items = new Map<string, WbsItem>();
  for (const activity of activities) {
    const segments = activity.wbs_code.split('.');
    segments.forEach((_, index) => {
      const code = segments.slice(0, index + 1).join('.');
      if (!items.has(code)) {
        items.set(code, {
          id: `wbs-${code.replaceAll('.', '-')}`,
          wbs_code: code,
          name: index === segments.length - 1 ? activity.name : `WBS ${code}`,
          parent_code: index === 0 ? null : segments.slice(0, index).join('.'),
        });
      }
    });
  }
  return Array.from(items.values()).sort((a, b) => a.wbs_code.localeCompare(b.wbs_code));
}

function generateWbsHeuristics(
  text: string,
  projectStart: string
): { wbsItems: WbsItem[]; activities: Activity[]; dependencies: Dependency[] } {
  const lowerText = text.toLowerCase();
  
  const hasExcavation = lowerText.includes('excavation') || lowerText.includes('earth') || lowerText.includes('dig') || lowerText.includes('soil');
  const hasConcrete = lowerText.includes('concrete') || lowerText.includes('pcc') || lowerText.includes('rcc') || lowerText.includes('cement');
  const hasStructure = lowerText.includes('bridge') || lowerText.includes('structure') || lowerText.includes('pier') || lowerText.includes('tunnel');
  const hasRoad = lowerText.includes('road') || lowerText.includes('highway') || lowerText.includes('expressway') || lowerText.includes('pavement');

  const activities: Activity[] = [];
  const dependencies: Dependency[] = [];

  // 1. Design & Approvals
  activities.push({
    id: 'act-ai-101',
    wbs_code: '01.01',
    name: 'Detailed Engineering Design & Approvals',
    baseline_start: projectStart,
    baseline_finish: addDays(projectStart, 44),
    planned_duration: 45,
    actual_quantity: 0,
    planned_quantity: 1,
    unit: 'Pkg',
    weightage: 10,
    resource_required: 'Senior Design Team',
    productivity_rate: 0.02,
    status: 'not_started'
  });

  activities.push({
    id: 'act-ai-102',
    wbs_code: '01.02',
    name: 'IFC Drawings Issuance',
    baseline_start: addDays(projectStart, 45),
    baseline_finish: addDays(projectStart, 59),
    planned_duration: 15,
    actual_quantity: 0,
    planned_quantity: 1,
    unit: 'Pkg',
    weightage: 5,
    resource_required: 'Project Coordinator',
    productivity_rate: 0.06,
    status: 'not_started'
  });
  dependencies.push({ id: 'dep-ai-1', predecessor_id: 'act-ai-101', successor_id: 'act-ai-102', type: 'FS', lag: 0 });

  // 2. Mobilization
  activities.push({
    id: 'act-ai-201',
    wbs_code: '02.01',
    name: 'Site Mobilization & Survey',
    baseline_start: addDays(projectStart, 31),
    baseline_finish: addDays(projectStart, 60),
    planned_duration: 30,
    actual_quantity: 0,
    planned_quantity: 1,
    unit: 'Pkg',
    weightage: 5,
    resource_required: 'Surveyor & Camp Team',
    productivity_rate: 0.03,
    status: 'not_started'
  });
  dependencies.push({ id: 'dep-ai-2', predecessor_id: 'act-ai-101', successor_id: 'act-ai-201', type: 'SS', lag: 15 });

  let lastActId = 'act-ai-102';
  let wbsCounter = 3;
  let weightRemaining = 80;

  if (hasExcavation) {
    const actId = `act-ai-${wbsCounter}01`;
    activities.push({
      id: actId,
      wbs_code: `0${wbsCounter}.01`,
      name: 'Bulk Excavation Works',
      baseline_start: addDays(projectStart, 60),
      baseline_finish: addDays(projectStart, 149),
      planned_duration: 90,
      actual_quantity: 0,
      planned_quantity: 50000,
      unit: 'm³',
      weightage: 20,
      resource_required: 'Excavation Crews',
      productivity_rate: 555,
      status: 'not_started'
    });
    dependencies.push({ id: `dep-ai-${wbsCounter}1`, predecessor_id: lastActId, successor_id: actId, type: 'FS', lag: 0 });
    dependencies.push({ id: `dep-ai-${wbsCounter}2`, predecessor_id: 'act-ai-201', successor_id: actId, type: 'FS', lag: 0 });
    lastActId = actId;
    wbsCounter++;
    weightRemaining -= 20;
  }

  if (hasConcrete) {
    const actId = `act-ai-${wbsCounter}01`;
    activities.push({
      id: actId,
      wbs_code: `0${wbsCounter}.01`,
      name: 'Foundation Concrete Pouring',
      baseline_start: addDays(projectStart, 150),
      baseline_finish: addDays(projectStart, 224),
      planned_duration: 75,
      actual_quantity: 0,
      planned_quantity: 8000,
      unit: 'm³',
      weightage: 25,
      resource_required: 'Concreting Batch Plant Crews',
      productivity_rate: 106,
      status: 'not_started'
    });
    dependencies.push({ id: `dep-ai-${wbsCounter}1`, predecessor_id: lastActId, successor_id: actId, type: 'FS', lag: 0 });
    lastActId = actId;
    wbsCounter++;
    weightRemaining -= 25;
  }

  if (hasStructure) {
    const actId = `act-ai-${wbsCounter}01`;
    activities.push({
      id: actId,
      wbs_code: `0${wbsCounter}.01`,
      name: 'Substructure & Pier Structural Works',
      baseline_start: addDays(projectStart, 225),
      baseline_finish: addDays(projectStart, 314),
      planned_duration: 90,
      actual_quantity: 0,
      planned_quantity: 1,
      unit: 'Pkg',
      weightage: 25,
      resource_required: 'Structural Formwork & Reinforcement Crew',
      productivity_rate: 0.01,
      status: 'not_started'
    });
    dependencies.push({ id: `dep-ai-${wbsCounter}1`, predecessor_id: lastActId, successor_id: actId, type: 'FS', lag: 0 });
    lastActId = actId;
    wbsCounter++;
    weightRemaining -= 25;
  } else if (hasRoad) {
    const actId = `act-ai-${wbsCounter}01`;
    activities.push({
      id: actId,
      wbs_code: `0${wbsCounter}.01`,
      name: 'Sub-grade and Pavement Layers construction',
      baseline_start: addDays(projectStart, 150),
      baseline_finish: addDays(projectStart, 249),
      planned_duration: 100,
      actual_quantity: 0,
      planned_quantity: 12,
      unit: 'km',
      weightage: 25,
      resource_required: 'Graders & Rollers crews',
      productivity_rate: 0.12,
      status: 'not_started'
    });
    dependencies.push({ id: `dep-ai-${wbsCounter}1`, predecessor_id: lastActId, successor_id: actId, type: 'FS', lag: 0 });
    lastActId = actId;
    wbsCounter++;
    weightRemaining -= 25;
  }

  // Final Handover
  const handoverActId = `act-ai-${wbsCounter}01`;
  activities.push({
    id: handoverActId,
    wbs_code: `0${wbsCounter}.01`,
    name: 'Commissioning & Handover to Employer',
    baseline_start: addDays(projectStart, 315),
    baseline_finish: addDays(projectStart, 344),
    planned_duration: 30,
    actual_quantity: 0,
    planned_quantity: 1,
    unit: 'Pkg',
    weightage: Math.max(5, weightRemaining),
    resource_required: 'Handover & QA/QC Director',
    productivity_rate: 0.03,
    status: 'not_started'
  });
  dependencies.push({ id: `dep-ai-${wbsCounter}1`, predecessor_id: lastActId, successor_id: handoverActId, type: 'FS', lag: 0 });

  return { wbsItems: deriveWbsItems(activities), activities, dependencies };
}
