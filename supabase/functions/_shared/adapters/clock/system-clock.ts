import type { Clock } from '../../ports/driven/clock.ts';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
