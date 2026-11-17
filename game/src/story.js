// story.js — the story of Tallow Point: five jobs for a courier who starts with an empty
// pocket and a borrowed phone, their dialogue, and the tiny state each job needs. Every name,
// place and line is written for this game.
import { CELL } from './config.js';

export const CHARACTERS = {
  barber: { name: 'Della Cask', role: 'barber and fixer', color: '#ffc94a', lines: [
    'You owe me, courier. First job is a rent collector that has stopped collecting.',
    'Mick Barrs keeps the parcel books at the wharf. Take his ledger and bring it to me, and the debt is square.',
    'If Barrs runs, the crows at the dock will find him.',
  ] },
  cop: { name: 'Wendell Ash', role: 'pd union rep', color: '#5aa8ff', lines: [
    'Della sent you. Good. I want the man who leaned on my accountant, not a war.',
    'Tail the cruiser from here to the impound lot. Keep a car length, keep the horn quiet.',
    'Reach the lot with your tail intact and I will owe you one.',
  ] },
  dockhand: { name: 'Cy Proudfoot', role: 'dockhand', color: '#58b46a', lines: [
    "Barrs keeps the ledger copy on the Marrow that is not talking.",
    'That old hull on the east water. Get aboard, grab the case, get out, and do not get shredded.',
    'Two men on watch. Maybe three. Bring a friend, or bring a gun.',
  ] },
  runner: { name: 'Vex', role: 'street runner', color: '#ff5ea8', lines: [
    'Barrs is in the wind. He is at the Sunmere docks holding a briefcase.',
    'You get him off the docks alive. The stripes will be thick once they hear.',
    'Run him to the safehouse in Crater Row. Do not stop for the flashing lights.',
  ] },
  builder: { name: 'Ruth Okoro', role: 'crane of the bay', color: '#39d2ff', lines: [
    'The parcel operation is done as of tonight. Ostrander Bank is doing its books at midnight.',
    'Take the cash crate off the north gate before the manager moves it. One car, one crate, no excuses.',
    'Then come home to Sunmere and we will call Tallow Point ours.',
  ] },
};

export const MISSIONS = [
  {
    id: 'ledger',
    number: '01',
    title: 'Ledger Run',
    giver: 'barber',
    kind: 'carry',
    start: { x: 2, y: 3 },
    goal: { x: 5.4, y: 4.35 },
    money: 450,
    brief: "Walk to the barbershop on Crater Row, take Della's car to Kessel Wharf and bring back Mick Barrs's ledger.",
  },
  {
    id: 'shadow',
    number: '02',
    title: 'Silent Partner',
    giver: 'cop',
    kind: 'tail',
    start: { x: 1.5, y: 2.5 },
    goal: { x: 3.5, y: 2.2 },
    money: 600,
    brief: 'Follow the plain cruiser from Crater Row to the impound lot on Moraine Heights without being seen.',
  },
  {
    id: 'docks',
    number: '03',
    title: 'Low Tide',
    giver: 'dockhand',
    kind: 'raid',
    spawn: { x: 68, y: 54, count: 4 },
    start: { x: 5, y: 5 },
    goal: { x: 6.2, y: 5.2 },
    money: 800,
    brief: 'Board the Marrow at Kessel Wharf, clear its guards and take the ledger copy.',
  },
  {
    id: 'extract',
    number: '04',
    title: 'Extraction',
    giver: 'runner',
    kind: 'escort',
    start: { x: 3.1, y: 1.2 },
    goal: { x: 1.4, y: 3.4 },
    money: 1200,
    brief: 'Pick up Vex in Sunmere, then drive them to the safehouse in Crater Row with the police behind you.',
  },
  {
    id: 'vault',
    number: '05',
    title: 'The Bay Run',
    giver: 'builder',
    kind: 'heist',
    start: { x: 3.6, y: 4.3 },
    goal: { x: 0.5, y: 1.5 },
    money: 2500,
    brief: "Lift Ostrander Bank's cash crate in Northline and bring it back to the Sunset kitchen in Sunmere.",
  },
];

export const START_CELL = { x: 1.7, y: 3.45 };
export const SHOP_CELL = { x: 2.3, y: 3.6 };
export const SUNMERE_CELL = { x: 3.6, y: 3.5 };
export const DOCK_CELL = { x: 6.25, y: 5.2 };
export const NORTH_CELL = { x: 1.5, y: 0.6 };

export function missionWorldPoint(cell) {
  return { x: cell.x * CELL, y: cell.y * CELL };
}

// What the objective line under the minimap says while a job runs.
export function objectiveText(mission, state) {
  if (!mission) return 'No job. Look for the gold markers on the map.';
  const carry = state.carryingLedger ? 'Ledger in hand. ' : '';
  switch (mission.kind) {
    case 'carry':
      if (state.carryingLedger) return carry + 'Return the ledger to Della at the barbershop in Crater Row.';
      if (state.inVehicle) return 'Drive to the wharf marker and find Barrs.';
      return 'Get to the wharf, then bring the ledger back to Crater Row.';
    case 'tail':
      return state.tailLost ? 'You lost the cruiser. Catch up before the lot.' : 'Stay behind the plain cruiser, at least half a block back.';
    case 'raid':
      if (state.guardsLeft > 0) return `Board the Marrow and drop its watch: ${state.guardsLeft} still standing.`;
      if (!state.carryingLedger) return 'Case in hand. Get it off the deck and run.';
      return 'The case is yours. Take it to Vex in Sunmere.';
    case 'escort':
      if (!state.passenger) return 'Pick up Vex at the Sunmere docks.';
      return 'Drive Vex to the safehouse in Crater Row without bailing.';
    case 'heist':
      if (!state.carryingCrate) return 'Reach Ostrander Bank in Northline and lift the cash crate.';
      return 'Drive the crate back to the Sunset kitchen in Sunmere.';
    default:
      return mission.brief;
  }
}
