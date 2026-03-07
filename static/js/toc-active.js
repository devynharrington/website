document.addEventListener("DOMContentLoaded", function () {
  const tocLinks = Array.from(document.querySelectorAll('#TableOfContents a'));
  if (!tocLinks.length) return;

  const headingMap = new Map();

  tocLinks.forEach((link) => {
    const id = decodeURIComponent(link.getAttribute("href").replace("#", ""));
    const heading = document.getElementById(id);
    if (heading) {
      headingMap.set(heading, link);
    }
  });

  const headings = Array.from(headingMap.keys());
  if (!headings.length) return;

  function setActiveLink() {
    let current = headings[0];

    for (const heading of headings) {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= 140) {
        current = heading;
      } else {
        break;
      }
    }

    tocLinks.forEach((link) => link.classList.remove("toc-active"));
    const activeLink = headingMap.get(current);
    if (activeLink) activeLink.classList.add("toc-active");
  }

  setActiveLink();
  window.addEventListener("scroll", setActiveLink, { passive: true });
  window.addEventListener("resize", setActiveLink);
});