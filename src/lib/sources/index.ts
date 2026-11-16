// One reader per Phase 1 hiring system. Workday, NHS Jobs and Trac come in Phase 2.
import type { SOURCE_SYSTEMS } from "@/db/schema";
import { readAshby } from "./ashby";
import { readGreenhouse } from "./greenhouse";
import { readLever } from "./lever";
import { readSmartRecruiters } from "./smartrecruiters";
import type { BoardReader } from "./types";
import { readWorkable } from "./workable";

export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];

export const READERS: Partial<Record<SourceSystem, BoardReader>> = {
  greenhouse: readGreenhouse,
  smartrecruiters: readSmartRecruiters,
  lever: readLever,
  ashby: readAshby,
  workable: readWorkable,
};
