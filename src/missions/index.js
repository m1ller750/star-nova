import { Level1 } from './level1.js';
import { Level2 } from './level2.js';
import { Level3 } from './level3.js';
import { Level4 } from './level4.js';
import { Level5 } from './level5.js';

export function createMission(n) {
  switch (n) {
    case 1: return new Level1();
    case 2: return new Level2();
    case 3: return new Level3();
    case 4: return new Level4();
    default: return new Level5();
  }
}
