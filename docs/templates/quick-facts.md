# Quick facts and emphasis

Implemented templates: `fact`, `number`, `quote` and `kpi`. Use one clear idea or measured value, its unit/meaning and necessary source context. Fact supports exact text, optional subtitle and supplied short items. Number accepts a numeric or exact-text value with label, unit and comparison; never invent a value for an empty source. Quote preserves attribution and source wording. KPI displays supplied metrics, not a backend metric calculation.

Get the selected template's current schema through `kanvas_discover` before publishing. Titles and presentation flags belong beside data, not inside it. No source/showSource fields exist; include necessary qualifications in supported content fields. [Template index](README.md).
