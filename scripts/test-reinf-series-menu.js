'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert(index.includes('Retenções Previdenciárias (Séries R-2000 e R-3000)'), 'menu deve exibir as séries R-2000/R-3000');
assert(index.includes('Rendimentos Pagos/Creditados (Série R-4000)'), 'menu deve exibir a série R-4000');
assert(index.includes('id="reinfSerie2000Panel" class="hidden"'), 'painel previdenciário deve iniciar fechado');
assert(index.includes('id="reinfSerie4000Panel" role="tabpanel"'), 'painel R-4000 deve iniciar disponível');
assert(index.includes("function alternarSerieReinf(serie)"), 'menu deve alternar as famílias de eventos');
assert(index.includes("acoes4000.classList.toggle('hidden', mostrar2000)"), 'ações R-4000 não podem aparecer na família previdenciária');

['R-2010', 'R-2020', 'R-2030', 'R-2040', 'R-2050', 'R-2055', 'R-2060', 'R-2099', 'R-3010'].forEach(evento => {
    assert(index.includes(`<strong>${evento}</strong>`), `menu previdenciário deve identificar ${evento}`);
});

['R-4010', 'R-4020', 'R-4040', 'R-4080', 'R-4099'].forEach(evento => {
    assert(index.includes(`<strong>${evento}</strong>`), `menu de rendimentos deve identificar ${evento}`);
});

assert(index.includes('<span class="badge badge-green">Homologado</span>'), 'R-4010 deve informar cobertura homologada');
assert(index.includes('<span class="badge badge-green">Integrado ao lote</span>'), 'R-4099 deve informar integração existente');
assert(index.includes('esta versão não envia eventos previdenciários como se estivessem prontos'), 'eventos sem motor não podem sugerir transmissão disponível');

console.log('OK: menu EFD-Reinf separa R-2000/R-3000 de R-4000 e expõe a cobertura real por evento.');
