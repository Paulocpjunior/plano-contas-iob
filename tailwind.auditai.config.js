/** @type {import('tailwindcss').Config} */
// Visual no estilo dos sistemas da Apple (12/10/2026), o mesmo do Consultor DP e do tema-apple.css do CCI:
// fonte do sistema primeiro (San Francisco no Mac/iPhone, Inter nos demais), cinzas neutros e um só azul de
// destaque nos tons da Apple, cantos um pouco maiores. As classes das telas não mudam: o tema redefine as
// paletas slate/gray, blue e indigo e a escala de cantos.
// ⚠️ A conciliação (auditai/conciliacao.html) usa o Tailwind do CDN com uma cópia destes valores; o
// scripts/test-tema-apple.js confere que as duas continuam iguais.
const neutros = {
  50: '#fbfbfd',
  100: '#f5f5f7',
  200: '#e8e8ed',
  300: '#d2d2d7',
  400: '#a1a1a6',
  500: '#6e6e73',
  600: '#515154',
  700: '#3a3a3c',
  800: '#2c2c2e',
  900: '#1c1c1e',
  950: '#000000'
};

// O azul 600 (#0071e3) mantém contraste AA com texto branco; o 500/400 é o do tema escuro.
const azul = {
  50: '#f0f7ff',
  100: '#e0efff',
  200: '#b8dcff',
  300: '#84c1ff',
  400: '#47a1ff',
  500: '#0a84ff',
  600: '#0071e3',
  700: '#0066cc',
  800: '#00509f',
  900: '#003e7a',
  950: '#00264d'
};

module.exports = {
  darkMode: 'class',
  content: [
    './auditai/index.html',
    './auditai/assets/*.js',
    './auditai/*.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Inter Variable"', 'Inter', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace']
      },
      colors: {
        primary: '#1c1c1e',
        secondary: '#3a3a3c',
        accent: '#0071e3',
        slate: neutros,
        gray: neutros,
        // Um só destaque: o índigo das telas antigas passa a ser o mesmo azul.
        blue: azul,
        indigo: azul
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem'
      }
    }
  },
  plugins: []
};
