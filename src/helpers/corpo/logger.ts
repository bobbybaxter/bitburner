import type { CityName } from '@ns';

export class Logger {
  readonly #enableLogging: boolean;
  city?: CityName;

  constructor(enableLogging: boolean, city?: CityName) {
    this.#enableLogging = enableLogging;
    this.city = city;
  }

  public log(...args: unknown[]) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.log(...args);
    }
  }

  public warn(...args: unknown[]) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.warn(...args);
    }
  }

  public error(...args: unknown[]) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.error(...args);
    }
  }

  public time(label: string) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.time(label);
    }
  }

  public timeEnd(label: string) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.timeEnd(label);
    }
  }

  public timeLog(label: string) {
    if (!this.#enableLogging) {
      return;
    }
    if (this.city === undefined || this.city === 'Sector-12') {
      console.timeLog(label);
    }
  }
}
