export function initializeHud(): HTMLElement {
  const d = eval('document') as Document;
  let htmlDisplay = d.getElementById('stock-display-1');
  if (htmlDisplay !== null) return htmlDisplay;
  const overviewHook = d.getElementById('overview-extra-hook-0');
  if (!overviewHook?.parentElement?.parentElement) throw new Error('HUD overview element not found');
  const customElements = overviewHook.parentElement.parentElement as HTMLElement;
  const stockValueTracker = customElements.cloneNode(true) as HTMLElement;
  stockValueTracker
    .querySelectorAll('p > p')
    .forEach((el: Element) => (el.parentElement as HTMLElement).removeChild(el));
  stockValueTracker
    .querySelectorAll('p')
    .forEach((el: Element, i: number) => ((el as HTMLElement).id = 'stock-display-' + i));
  htmlDisplay = stockValueTracker.querySelector('#stock-display-1') as HTMLElement | null;
  if (!htmlDisplay) throw new Error('Stock display element not found');
  (stockValueTracker.querySelectorAll('p')[0] as HTMLElement).innerText = 'Stock';
  htmlDisplay.innerText = '$0.000 ';
  const parent = customElements.parentElement;
  if (!parent) throw new Error('HUD parent element not found');
  parent.insertBefore(stockValueTracker, parent.childNodes[2]);
  return htmlDisplay;
}
