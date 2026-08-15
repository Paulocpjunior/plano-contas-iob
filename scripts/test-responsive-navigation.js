#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

[
  'id="navMenuToggle"',
  'id="mainNavigation"',
  'id="navBackdrop"',
  'class="nav-cluster-toggle"',
  'class="nav-module-button',
  'aria-haspopup="menu"',
  'id="navClusterOperacaoMenu"',
  'id="navClusterContabilMenu"',
  'id="navClusterObrigacoesMenu"',
  'id="navClusterInteligenciaMenu"',
  '@media (min-width: 1024px) and (max-width: 1439px)',
  '@media (max-width: 1023px)',
  'function toggleResponsiveNav()',
  'function toggleNavCluster(button, event)',
  "document.querySelectorAll('.nav-module-button')",
].forEach((trecho) => assert(html.includes(trecho), `Navegação responsiva ausente: ${trecho}`));

assert(!html.includes("document.querySelectorAll('.nav button')"), 'showPage ainda depende do seletor antigo .nav button');
assert(html.includes("if (e.key === 'Escape') closeResponsiveNav()"), 'A gaveta deve fechar com Escape');
assert(!html.includes('id="empVerTudo"'), 'Admin não deve depender de checkbox para visualizar todas as empresas');
assert(server.includes('const verTudo = !!req.user.is_admin;'), 'Servidor não garante automaticamente a visão integral do admin');

console.log('OK: navegação responsiva validada estruturalmente.');
