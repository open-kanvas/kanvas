import {z} from 'zod';

export const keyboardShortcutsDataSchema = z.object({}).strict().describe('Complete maintained Kanvas hotkey reference, grouped responsively in one view. No supplied rows needed.');
