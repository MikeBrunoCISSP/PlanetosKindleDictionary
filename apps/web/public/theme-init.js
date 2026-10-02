try {
  if (localStorage.getItem("planetos-theme") !== "light") {
    document.documentElement.classList.add("dark");
  }
} catch (e) {
  document.documentElement.classList.add("dark");
}
