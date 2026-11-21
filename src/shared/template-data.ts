import {z} from 'zod';
import {keyboardShortcutsDataSchema} from './keyboard-shortcuts-schema.js';
import {overviewDataSchema} from './overview-schema.js';
import {settingsDataSchema} from './settings-schema.js';
import {htmlDataSchema} from './html-schema.js';
import {timelineDataSchema} from './timeline-schema.js';
import {itineraryDataSchema} from './itinerary-schema.js';
import {productDataSchema} from './product-schema.js';
import {weatherDataSchema} from './weather-schema.js';
import {profileDataSchema} from './profile-schema.js';
import {kpiDataSchema} from './kpi-schema.js';
import {quoteDataSchema} from './quote-schema.js';
import {storyCardsDataSchema} from './story-cards-schema.js';
import {recipeDataSchema} from './recipe-schema.js';
import {procedureDataSchema} from './procedure-schema.js';
import {joinDataSchema} from './join-schema.js';
import {menuDataSchema} from './menu-schema.js';
import {leaderboardDataSchema} from './leaderboard-schema.js';
import {statusDataSchema} from './status-schema.js';

/** Template schemas shared by validation and typed renderer data. */
export const templateSchemas = {
  'keyboard-shortcuts': keyboardShortcutsDataSchema,
  'overview': overviewDataSchema,
  'settings': settingsDataSchema,
  'html': htmlDataSchema,
  'timeline': timelineDataSchema,
  'itinerary': itineraryDataSchema,
  'product': productDataSchema,
  'weather': weatherDataSchema,
  'profile': profileDataSchema,
  'kpi': kpiDataSchema,
  'quote': quoteDataSchema,
  'story-cards': storyCardsDataSchema,
  'recipe': recipeDataSchema,
  'procedure': procedureDataSchema,
  'join': joinDataSchema,
  'menu': menuDataSchema,
  'leaderboard': leaderboardDataSchema,
  'status': statusDataSchema,
};
export type SchemaTemplateId = keyof typeof templateSchemas;
export type TemplateData<K extends SchemaTemplateId> = z.infer<(typeof templateSchemas)[K]>;
