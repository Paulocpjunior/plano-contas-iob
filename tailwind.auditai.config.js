/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './auditai/index.html',
    './auditai/assets/*.js',
    './auditai/*.js'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        secondary: '#334155',
        accent: '#2563eb'
      }
    }
  },
  plugins: []
};
