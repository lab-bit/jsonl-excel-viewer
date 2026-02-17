export function getThemeClass(): string {
  const body = document.body;
  const vscodeTheme = body.getAttribute('data-vscode-theme-kind');

  if (vscodeTheme === 'vscode-dark' || vscodeTheme === 'vscode-high-contrast') {
    return 'ag-theme-alpine-dark';
  }
  return 'ag-theme-alpine';
}

export function applyTheme(container: HTMLElement): void {
  const themeClass = getThemeClass();
  container.classList.remove('ag-theme-alpine', 'ag-theme-alpine-dark');
  container.classList.add(themeClass);
}

export function observeThemeChanges(container: HTMLElement): void {
  const observer = new MutationObserver(() => {
    applyTheme(container);
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-vscode-theme-kind'],
  });
}
