/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/app/**/*.{js,ts,jsx,tsx}", 
      "./src/components/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
      extend: {
        fontSize: {
          '2xs': '0.625rem', // 10px
          '3xs': '0.5625rem', // 9px
          '4xs': '0.5rem',   // 8px
        }
      },
    },
    plugins: [],
  };
  