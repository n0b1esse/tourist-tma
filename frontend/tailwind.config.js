/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2D6A4F",
        accent: "#E07A5F",
        draft: "#F4A261",
        success: "#52B788",
      },
      fontSize: {
        h1: ["22px", { fontWeight: "700" }],
        h2: ["17px", { fontWeight: "600" }],
        body: ["15px", { fontWeight: "400" }],
        caption: ["12px", { fontWeight: "400" }],
      },
    },
  },
  plugins: [],
};
