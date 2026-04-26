import type { Clock } from '../../ports/driven/clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
