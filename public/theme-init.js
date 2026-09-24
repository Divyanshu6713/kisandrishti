// Apply the saved/system theme before first paint (no flash, no layout shift).
(function () {
  try {
    var t = localStorage.getItem('kd-theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  } catch (e) { document.documentElement.dataset.theme = 'light'; }
})();
