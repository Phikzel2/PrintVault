/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      animation: {
        "chip-in": "chip-in 0.15s ease-out",
        "loading-progress": "loading-progress 1.5s ease-out forwards",
        "toast-in": "toast-in 0.2s ease-out",
      },
      keyframes: {
        "chip-in": {
          "0%": { opacity: "0", transform: "scale(0.75)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "loading-progress": {
          "0%": { width: "0%" },
          "30%": { width: "50%" },
          "70%": { width: "75%" },
          "100%": { width: "85%" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
