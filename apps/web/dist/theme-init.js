try {
  if (localStorage.getItem("planetos-theme") === "dark") {
    document.documentElement.classList.add("dark");
  }
} catch (e) {
  // ignore
}
