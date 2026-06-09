import type { Course, Hole } from "../types";

// A canonical 18-hole course: par 72, classic 4-4-3-4-5-4-4-3-5 / 4-5-3-4-4-3-4-5-4 layout.
// Stroke indices are the typical Augusta-style spread (low SI on hard holes).
export const PAR: number[] = [4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 5, 3, 4, 4, 3, 4, 5, 4];
//                            1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18
export const SI: number[] = [5, 11, 17, 7, 1, 13, 9, 15, 3, 6, 2, 18, 8, 10, 16, 14, 4, 12];

export const TEST_HOLES: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par: PAR[i],
  stroke_index: SI[i],
}));

export const TEST_COURSE: Course = {
  holes: TEST_HOLES,
  par: 72,
  rating: 71.5,
  slope: 130,
};
