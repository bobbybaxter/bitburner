// This script is awesome and will autocomplete the infiltrate tasks in bitburner.
// It does not always run properly, it could be a browser issue and works 95% with game running on edge browser.
// This was copied from https://pastebin.com/7DuFYDpJ and modified to work with shadows of anarchy augments.
// Type "wget https://raw.githubusercontent.com/5p0ng3b0b/bitburner-scripts/main/autoinfiltrate.js autoinfiltrate.js" from you home terminal to download.
// Type 'run autoinfiltrate.js' from home terminal. options are --start --stop --quiet although the --start option is not required.
// Try always running it via an alias eg 'alias autoinfil="run autoinfiltrate.js --stop --quiet; run autoinfiltrate.js --quiet""
// Once the script is running, It will activate when you visit any company and click the infiltrate button.
// You can use infiltrate to quickly get alot of money early in the game or quickly earn rep for any faction.
// ecorp in Aevum is the highest earner followed by megacorp in sector-12 and then KuaiGong International in Chongqing.

import type { NS } from '@ns';

interface GameState {
  data?: string[] | number[] | boolean[][] | [number, number][] | string;
  x?: number;
  y?: number;
  cols?: number;
  dir?: number;
  current?: string;
}

const state = {
  // Name of the company that's infiltrated.
  company: '',

  // Whether infiltration started. False means, we're
  // waiting to arrive on the infiltration screen.
  started: false,

  // Details/state of the current mini game.
  // Is reset after every game.
  game: {} as GameState,
};

// Speed of game actions, in milliseconds. Default 22
const speed = 25;

// Small hack to save RAM.
// This will work smoothly, because the script does not use
// any "ns" functions, it's a pure browser automation tool.
const wnd = eval('window') as Window & { tmrAutoInf?: ReturnType<typeof setInterval> };
const doc = wnd['document'] as Document & {
  _addEventListener?: typeof Document.prototype.addEventListener;
  _removeEventListener?: typeof Document.prototype.removeEventListener;
  eventListeners?: Record<
    string,
    Array<{
      listener: EventListenerOrEventListenerObject;
      useCapture: boolean | AddEventListenerOptions;
      wrapped: EventListenerOrEventListenerObject | false;
    }>
  >;
};

// List of all games and an automated solver.
const infiltrationGames: Array<{
  name: string;
  init: (screen: Element) => void;
  play: (screen: Element) => void;
}> = [
  {
    name: 'type it',
    init: function (screen: Element) {
      const lines = getLines(getEl(screen, 'p'));
      state.game.data = lines[0].split('');
    },
    play: function (screen: Element) {
      if (!state.game.data || !state.game.data.length) {
        delete state.game.data;
        return;
      }

      const next = Array.isArray(state.game.data) ? state.game.data.shift() : undefined;
      if (next !== undefined && (typeof next === 'string' || typeof next === 'number')) pressKey(next);
    },
  },
  {
    name: 'type it backward',
    init: function (screen: Element) {
      const lines = getLines(getEl(screen, 'p'));
      state.game.data = lines[0].split('');
    },
    play: function (screen: Element) {
      if (!state.game.data || !state.game.data.length) {
        delete state.game.data;
        return;
      }

      const next = Array.isArray(state.game.data) ? state.game.data.shift() : undefined;
      if (next !== undefined && (typeof next === 'string' || typeof next === 'number')) pressKey(next);
    },
  },
  {
    name: 'enter the code',
    init: function (_screen: Element) {},
    play: function (screen: Element) {
      const h4 = getEl(screen, 'h4');
      const spanElements = h4[1].querySelectorAll('span');
      // Adjust for SoA - Trickery of Hermes augmentation
      // Use the "style" attribute to identify the current code instead of its content
      const code = Array.from(spanElements)
        .filter((span: Element) => {
          const styleAttr = (span as HTMLElement).attributes?.getNamedItem?.('style');
          return !styleAttr || !styleAttr.textContent;
        })
        .map((span: Element) => span.textContent)
        .pop();

      switch (code) {
        case '↑':
          pressKey('w');
          break;
        case '↓':
          pressKey('s');
          break;
        case '←':
          pressKey('a');
          break;
        case '→':
          pressKey('d');
          break;
      }
    },
  },
  {
    name: 'close the brackets',
    init: function (screen: Element) {
      const data = getLines(getEl(screen, 'p'));
      const brackets = data.join('').split('');
      const bracketData: string[] = [];

      for (let i = brackets.length - 1; i >= 0; i--) {
        const char = brackets[i];

        if ('<' == char) {
          bracketData.push('>');
        } else if ('(' == char) {
          bracketData.push(')');
        } else if ('{' == char) {
          bracketData.push('}');
        } else if ('[' == char) {
          bracketData.push(']');
        }
      }
      state.game.data = bracketData;
    },
    play: function (screen: Element) {
      if (!Array.isArray(state.game.data) || !state.game.data.length) {
        delete state.game.data;
        return;
      }

      const next = state.game.data.shift();
      if (next !== undefined && (typeof next === 'string' || typeof next === 'number')) pressKey(next);
    },
  },
  {
    name: 'guarding', // attack when his guard is down
    init: function (screen: Element) {
      state.game.data = 'wait';
    },
    play: function (_screen: Element) {
      /* do nothing */
    },
  },
  {
    name: 'distracted', // attack when his guard is down
    init: function (screen: Element) {
      state.game.data = 'wait';
    },
    play: function (_screen: Element) {
      pressKey(' ');
      state.game.data = 'done';
    },
  },
  {
    name: 'alerted', // attack when his guard is down
    init: function (screen: Element) {
      state.game.data = 'wait';
    },
    play: function (_screen: Element) {
      /* do nothing */
    },
  },
  {
    name: 'say something nice about the guard',
    init: function (_screen: Element) {},
    play: function (screen: Element) {
      const correct = [
        'affectionate',
        'agreeable',
        'bright',
        'charming',
        'creative',
        'determined',
        'energetic',
        'friendly',
        'funny',
        'generous',
        'polite',
        'likable',
        'diplomatic',
        'helpful',
        'giving',
        'kind',
        'hardworking',
        'patient',
        'dynamic',
        'loyal',
        'based',
        'straightforward',
      ];
      const word = getLines(getEl(screen, 'h5'))[1];

      if (-1 !== correct.indexOf(word)) {
        pressKey(' ');
      } else {
        pressKey('w');
      }
    },
  },
  {
    name: 'remember all the mines',
    init: function (screen: Element) {
      const rows = getEl(screen, 'p');
      let gridSize = null;
      switch (rows.length) {
        case 9:
          gridSize = [3, 3];
          break;
        case 12:
          gridSize = [3, 4];
          break;
        case 16:
          gridSize = [4, 4];
          break;
        case 20:
          gridSize = [4, 5];
          break;
        case 25:
          gridSize = [5, 5];
          break;
        case 30:
          gridSize = [5, 6];
          break;
        case 36:
          gridSize = [6, 6];
          break;
      }
      if (gridSize == null) {
        return;
      }
      //12 20 30 42
      state.game.data = [];
      let index = 0;
      //for each row
      for (let y = 0; y < gridSize[1]; y++) {
        //initialize array data
        (state.game.data as boolean[][])[y] = [];
        for (let x = 0; x < gridSize[0]; x++) {
          //for each column in the row add to state data if it has a child
          if ((rows[index] as unknown as Element).children.length > 0) {
            (state.game.data as boolean[][])[y].push(true);
          } else (state.game.data as boolean[][])[y].push(false);
          index += 1;
        }
      }
    },
    play: function (_screen: Element) {},
  },
  {
    name: 'mark all the mines',
    init: function (screen: Element) {
      const data = state.game.data;
      if (!data || !Array.isArray(data) || !data[0]) return;
      state.game.x = 0;
      state.game.y = 0;
      state.game.cols = (data[0] as boolean[]).length;
      state.game.dir = 1;
    },
    play: function (screen: Element) {
      const { data, cols } = state.game;
      let { x = 0, y = 0, dir = 1 } = state.game;
      if (!data || !Array.isArray(data) || cols === undefined) return;

      const gridData = data as boolean[][];
      if (gridData[y][x]) {
        pressKey(' ');
        gridData[y][x] = false;
      }

      x += dir;

      if (x < 0 || x >= cols) {
        x = Math.max(0, Math.min(cols - 1, x));
        y++;
        dir *= -1;
        pressKey('s');
      } else {
        pressKey(dir > 0 ? 'd' : 'a');
      }

      state.game.data = gridData;
      state.game.x = x;
      state.game.y = y;
      state.game.dir = dir;
    },
  },
  {
    name: 'match the symbols',
    init: function (screen: Element) {
      const data = getLines(getEl(screen, 'h5 span'));
      const rows = getLines(getEl(screen, 'p'));
      const keypad: string[][] = [];
      const targets: [number, number][] = [];
      let gridSize = null;
      switch (rows.length) {
        case 9:
          gridSize = [3, 3];
          break;
        case 12:
          gridSize = [3, 4];
          break;
        case 16:
          gridSize = [4, 4];
          break;
        case 20:
          gridSize = [4, 5];
          break;
        case 25:
          gridSize = [5, 5];
          break;
        case 30:
          gridSize = [5, 6];
          break;
        case 36:
          gridSize = [6, 6];
          break;
      }
      if (gridSize == null) {
        return;
      }
      //build the keypad grid.
      let index = 0;
      for (let i = 0; i < gridSize[1]; i++) {
        keypad[i] = [];
        for (let y = 0; y < gridSize[0]; y++) {
          keypad[i].push(rows[index]);
          index += 1;
        }
      }
      //foreach data get coords of keypad entry
      for (let i = 0; i < data.length; i++) {
        const symbol = data[i].trim();
        //for each keypad entry
        for (let j = 0; j < keypad.length; j++) {
          const k = keypad[j].indexOf(symbol);

          if (-1 !== k) {
            targets.push([j, k]);
            break;
          }
        }
      }
      state.game.data = targets;
      state.game.x = 0;
      state.game.y = 0;
    },
    play: function (screen: Element) {
      const target = state.game.data?.[0] as [number, number] | undefined;
      let { x = 0, y = 0 } = state.game;

      if (!target) {
        return;
      }

      const to_y = target[0];
      const to_x = target[1];

      if (to_y < y) {
        y--;
        pressKey('w');
      } else if (to_y > y) {
        y++;
        pressKey('s');
      } else if (to_x < x) {
        x--;
        pressKey('a');
      } else if (to_x > x) {
        x++;
        pressKey('d');
      } else {
        pressKey(' ');
        const gameData = state.game.data;
        if (Array.isArray(gameData)) gameData.shift();
      }

      state.game.x = x;
      state.game.y = y;
    },
  },
  {
    name: 'cut the wires with the following properties',
    init: function (screen: Element) {
      const numberHack = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
      const colors: Record<string, string> = {
        red: 'red',
        white: 'white',
        blue: 'blue',
        'rgb(255, 193, 7)': 'yellow',
      };
      const wireColor: Record<string, number[]> = {
        red: [],
        white: [],
        blue: [],
        yellow: [],
      };
      //gather the instructions
      const children: Element[] = [];
      for (const child of screen.children) children.push(child);
      const wiresData = children.pop();
      children.shift();
      const instructions = getLines(children);
      //get the wire information
      if (!wiresData) return;
      const samples = getEl(wiresData, 'p');
      const wires = [];
      //get the amount of wires
      let wireCount = 0;
      for (let i = wireCount; i < samples.length; i++) {
        if (numberHack.includes((samples[i] as HTMLElement).innerText)) wireCount += 1;
        else break;
      }
      let index = 0;
      //get just the first 3 rows of wires.
      for (let i = 0; i < 3; i++) {
        //for each row
        for (let j = 0; j < wireCount; j++) {
          const node = samples[index] as HTMLElement;
          const color = colors[node.style.color as string];
          if (!color) {
            index += 1;
            continue;
          }
          wireColor[color].push(j + 1);
          index += 1;
        }
      }

      for (let i = 0; i < instructions.length; i++) {
        const line = instructions[i].trim().toLowerCase();

        if (!line || line.length < 10) {
          continue;
        }
        if (-1 !== line.indexOf('cut wires number')) {
          const parts = line.split(/(number\s*|\.)/);
          wires.push(parseInt(parts[2]));
        }
        if (-1 !== line.indexOf('cut all wires colored')) {
          const parts = line.split(/(colored\s*|\.)/);
          const color = parts[2];

          if (!wireColor[color]) {
            // should never happen.
            continue;
          }

          wireColor[color].forEach((num: number) => wires.push(num));
        }
      }

      // new Set() removes duplicate elements.
      state.game.data = [...new Set(wires)];
    },
    play: function (_screen: Element) {
      const wire = state.game.data;
      //state.game.data.shift();
      if (!Array.isArray(wire)) {
        return;
      }
      for (let i = 0; i < wire.length; i++) {
        pressKey((wire as number[])[i].toString());
      }
    },
  },
];

/** @param {NS} ns **/
export async function main(ns: NS): Promise<void> {
  const args = ns.flags([
    ['start', false],
    ['stop', false],
    ['status', false],
    ['quiet', false],
  ]);

  function print(msg: string): void {
    if (!args.quiet) {
      ns.tprint(`\n${msg}\n`);
    }
  }

  if (args.status) {
    if (wnd.tmrAutoInf) {
      print('Automated infiltration is active');
    } else {
      print('Automated infiltration is inactive');
    }
    return;
  }

  if (wnd.tmrAutoInf) {
    print('Stopping automated infiltration...');
    clearInterval(wnd.tmrAutoInf);
    delete wnd.tmrAutoInf;
  }

  if (args.stop) {
    return;
  }

  print(
    'Automated infiltration is enabled...\nWhen you visit the infiltration screen of any company, all tasks are completed automatically.',
  );

  endInfiltration();

  // Monitor the current screen and start infiltration once a
  // valid screen is detected.
  wnd.tmrAutoInf = setInterval(infLoop, speed);

  // Modify the addEventListener logic.
  wrapEventListeners();
}

/**
 * The infiltration loop, which is called at a rapid interval
 */
function infLoop() {
  if (!state.started) {
    waitForStart();
  } else {
    playGame();
  }
}

/**
 * Returns a list of DOM elements from the main game
 * container.
 */
function getEl(selector: string): NodeListOf<Element>;
function getEl(parent: Document | Element, selector: string): NodeListOf<Element>;
function getEl(parent: Document | Element | string, selector?: string): NodeListOf<Element> {
  let prefix = ':scope';
  let actualParent: Document | Element = doc;
  let actualSelector: string;

  if (typeof parent === 'string') {
    actualSelector = parent;
    actualParent = doc;

    prefix = '.MuiBox-root>.MuiBox-root>.MuiBox-root';

    if (!doc.querySelectorAll(prefix).length) {
      prefix = '.MuiBox-root>.MuiBox-root>.MuiGrid-root';
    }
    if (!doc.querySelectorAll(prefix).length) {
      prefix = '.MuiContainer-root>.MuiPaper-root';
    }
    if (!doc.querySelectorAll(prefix).length) {
      return [] as unknown as NodeListOf<Element>;
    }
  } else {
    actualParent = parent;
    actualSelector = selector!;
  }

  const fullSelector = actualSelector
    .split(',')
    .map((item: string) => `${prefix} ${item}`)
    .join(',');

  return actualParent.querySelectorAll(fullSelector);
}

/**
 * Returns the first element with matching text content.
 */
function filterByText(elements: NodeListOf<Element> | Element[], text: string): Element | null {
  text = text.toLowerCase();

  for (let i = 0; i < elements.length; i++) {
    const content = (elements[i].textContent ?? '').toLowerCase();

    if (-1 !== content.indexOf(text)) {
      return elements[i];
    }
  }

  return null;
}

/**
 * Returns an array with the text-contents of the given elements.
 *
 * @param {NodeList} elements
 * @returns {string[]}
 */
function getLines(elements: NodeListOf<Element> | Element[]): string[] {
  const lines: string[] = [];
  elements.forEach((el: Element) => lines.push(el.textContent ?? ''));

  return lines;
}

/**
 * Reset the state after infiltration is done.
 */
function endInfiltration() {
  unwrapEventListeners();
  state.company = '';
  state.started = false;
}

/**
 * Simulate a keyboard event (keydown + keyup).
 *
 * @param {string|int} keyOrCode A single letter (string) or key-code to send.
 */
function pressKey(keyOrCode: string | number): void {
  let keyCode = 0;
  let key = '';

  if ('string' === typeof keyOrCode && keyOrCode.length > 0) {
    key = keyOrCode.toLowerCase().substr(0, 1);
    keyCode = key.charCodeAt(0);
  } else if ('number' === typeof keyOrCode) {
    keyCode = keyOrCode;
    key = String.fromCharCode(keyCode);
  }

  if (!keyCode || key.length !== 1) {
    return;
  }

  function sendEvent(event: 'keydown' | 'keyup'): void {
    const keyboardEvent = new KeyboardEvent(event, {
      key,
      keyCode,
    });

    doc.dispatchEvent(keyboardEvent);
  }

  sendEvent('keydown');
}

/**
 * Infiltration monitor to start automatic infiltration.
 *
 * This function runs asynchronously, after the "main" function ended,
 * so we cannot use any "ns" function here!
 */
function waitForStart() {
  if (state.started) {
    return;
  }

  const h4 = getEl('h4');

  if (!h4.length) {
    return;
  }
  const title = h4[0].textContent ?? '';
  if (0 !== title.indexOf('Infiltrating')) {
    return;
  }

  const btnStart = filterByText(getEl('button'), 'Start');
  if (!btnStart) {
    return;
  }

  state.company = title.substr(13);
  state.started = true;
  wrapEventListeners();

  console.log('Start automatic infiltration of', state.company);
  (btnStart as HTMLElement).click();
}

/**
 * Identify the current infiltration game.
 */
function playGame() {
  const screens = doc.querySelectorAll('.MuiContainer-root');

  if (!screens.length) {
    endInfiltration();
    return;
  }
  if (screens[0].children.length < 3) {
    return;
  }

  const screen = screens[0].children[2];
  const h4 = getEl(screen, 'h4');

  if (!h4.length) {
    endInfiltration();
    return;
  }

  const title = (h4[0].textContent ?? '').trim().toLowerCase().split(/[!.(]/)[0];

  if ('infiltration successful' === title) {
    endInfiltration();
    return;
  }

  if ('get ready' === title) {
    return;
  }

  const game = infiltrationGames.find((game) => game.name === title);

  if (game) {
    if (state.game.current !== title) {
      state.game.current = title;
      game.init(screen);
    }

    game.play(screen);
  } else {
    console.error('Unknown game:', title);
  }
}

/**
 * Wrap all event listeners with a custom function that injects
 * the "isTrusted" flag.
 *
 * Is this cheating? Or is it real hacking? Don't care, as long
 * as it's working :)
 */
function wrapEventListeners() {
  if (!doc._addEventListener) {
    doc._addEventListener = doc.addEventListener;

    doc.addEventListener = function (
      type: string,
      callback: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if ('undefined' === typeof options) {
        options = false;
      }
      let handler: EventListenerOrEventListenerObject | false = false;

      // For this script, we only want to modify "keydown" events.
      if ('keydown' === type) {
        const wrappedHandler = function (this: typeof callback, ...args: [KeyboardEvent]) {
          const ev = args[0];
          if (!ev.isTrusted) {
            const hackedEv: Record<string, unknown> = {};

            for (const key in ev) {
              const val = (ev as unknown as Record<string, unknown>)[key];
              if ('isTrusted' === key) {
                hackedEv.isTrusted = true;
              } else if (typeof val === 'function') {
                hackedEv[key] = val.bind(ev);
              } else {
                hackedEv[key] = val;
              }
            }

            Object.setPrototypeOf(hackedEv, KeyboardEvent.prototype);
            args[0] = hackedEv as unknown as KeyboardEvent;
          }

          if (typeof callback === 'function') {
            return callback.apply(this, args);
          }
          return (callback as EventListenerObject).handleEvent(args[0]);
        };

        for (const prop in callback as unknown as Record<string, unknown>) {
          const val = (callback as unknown as Record<string, unknown>)[prop];
          if (typeof val === 'function') {
            (wrappedHandler as unknown as Record<string, unknown>)[prop] = val.bind(callback);
          } else {
            (wrappedHandler as unknown as Record<string, unknown>)[prop] = val;
          }
        }
        handler = wrappedHandler as EventListenerOrEventListenerObject;
      }

      if (!this.eventListeners) {
        this.eventListeners = {};
      }
      if (!this.eventListeners[type]) {
        this.eventListeners[type] = [];
      }
      this.eventListeners[type].push({
        listener: callback,
        useCapture: options,
        wrapped: handler,
      });

      return this._addEventListener!(type, handler ? handler : callback, options);
    };
  }

  if (!doc._removeEventListener) {
    doc._removeEventListener = doc.removeEventListener;

    doc.removeEventListener = function (
      type: string,
      callback: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      if ('undefined' === typeof options) {
        options = false;
      }

      if (!this.eventListeners) {
        this.eventListeners = {};
      }
      if (!this.eventListeners[type]) {
        this.eventListeners[type] = [];
      }

      for (let i = 0; i < this.eventListeners[type].length; i++) {
        if (this.eventListeners[type][i].listener === callback && this.eventListeners[type][i].useCapture === options) {
          const wrapped = this.eventListeners![type][i].wrapped;
          if (wrapped) {
            callback = wrapped as EventListenerOrEventListenerObject;
          }

          this.eventListeners[type].splice(i, 1);
          break;
        }
      }

      if (this.eventListeners[type].length == 0) {
        delete this.eventListeners[type];
      }

      return this._removeEventListener!(type, callback, options);
    };
  }
}

/**
 * Revert the "wrapEventListeners" changes.
 */
function unwrapEventListeners() {
  if (doc._addEventListener) {
    doc.addEventListener = doc._addEventListener;
    delete doc._addEventListener;
  }
  if (doc._removeEventListener) {
    doc.removeEventListener = doc._removeEventListener;
    delete doc._removeEventListener;
  }
  delete doc.eventListeners;
}
