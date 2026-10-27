import type { Layout, PlanGroup, PlanItem } from './projects'
import type { Priority } from './tasks'

// Ready-made project templates. "Customize" copies one into your own templates, where you can change anything.
export type Starter = { key: string; name: string; description: string; layout: Layout; count_from: 'start' | 'launch'; groups: PlanGroup[] }

let n = 0
const item = (title: string, offset: number, priority: Priority = 'none'): PlanItem => ({ id: `s${++n}`, title, offset, priority })
const group = (name: string, items: PlanItem[], offset = 0, in_order = false): PlanGroup => ({ id: `g${++n}`, name, offset, in_order, items })

export const starters: Starter[] = [
  {
    key: 'product-launch',
    name: 'Product launch',
    description: 'Counts back from launch day',
    layout: 'milestones',
    count_from: 'launch',
    groups: [
      group('Waitlist opens', [item('Pick the launch offer and price', -42, 'high'), item('Write the waitlist page', -38), item('Set up the waitlist email', -36), item('Share the waitlist', -35)], -35),
      group('Sales page live', [item('Write the sales page', -24, 'high'), item('Gather testimonials', -22), item('Design the sales page', -18), item('Test checkout', -15, 'high')], -14),
      group('Cart opens', [item('Record the launch video', -10, 'high'), item('Schedule launch emails', -6), item('Plan launch week posts', -5), item('Go live', 0, 'urgent')], 0),
      group('Cart closes', [item('Send the last call email', 6), item('Close the cart', 7, 'high'), item('Welcome the new buyers', 8), item('Write down what worked', 10)], 7),
    ],
  },
  {
    key: 'client-onboarding',
    name: 'Client onboarding',
    description: 'Welcome a new client in their first two weeks',
    layout: 'phases',
    count_from: 'start',
    groups: [
      group('Welcome', [item('Send the welcome email', 0, 'high'), item('Send the contract and invoice', 0, 'high'), item('Send the intake form', 1)], 0, true),
      group('Set up', [item('Create their shared folder', 2), item('Book the kickoff call', 2, 'high'), item('Review their intake answers', 4), item('Prep the kickoff agenda', 5)], 0),
      group('Kickoff', [item('Kickoff call', 7, 'high'), item('Send the call recap and next steps', 8), item('Check in after week one', 13)], 0),
    ],
  },
  {
    key: 'retreat-event',
    name: 'Retreat or event',
    description: 'Counts back from event day',
    layout: 'milestones',
    count_from: 'launch',
    groups: [
      group('Venue booked', [item('Set the budget', -95, 'high'), item('Shortlist venues', -92), item('Visit or video tour the top two', -88), item('Sign the venue contract', -84, 'high')], -84),
      group('Tickets on sale', [item('Write the event page', -66), item('Set up ticketing', -62, 'high'), item('Announce the event', -60), item('Email your list', -59)], -60),
      group('Final details', [item('Confirm catering', -21), item('Order welcome gifts', -18), item('Send the packing list', -10), item('Print name tags and signs', -4)], -7),
      group('Event day', [item('Set up the room', 0, 'high'), item('Run the event', 0, 'urgent'), item('Send the thank you email', 2), item('Ask for feedback', 3)], 0),
    ],
  },
  {
    key: 'course-creation',
    name: 'Course creation',
    description: 'Plan, record, and launch a course',
    layout: 'phases',
    count_from: 'start',
    groups: [
      group('Plan', [item('Pick the promise of the course', 0, 'high'), item('Outline the modules', 2), item('Write lesson titles', 4)], 0),
      group('Create', [item('Write the scripts', 7, 'high'), item('Make the slides and worksheets', 12), item('Set up filming space', 13), item('Record the lessons', 16, 'high'), item('Edit the videos', 22)], 0, true),
      group('Set up', [item('Upload to the course platform', 26), item('Write the welcome lesson', 27), item('Test the student experience', 29, 'high')], 0),
      group('Launch', [item('Open enrollment', 32, 'high'), item('Email your list', 32), item('Welcome the first students', 35)], 0),
    ],
  },
]
