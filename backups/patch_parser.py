#!/usr/bin/env python3
import shutil, datetime, sys

BACKUP = 'index.html.pre-parser.' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
shutil.copy('index.html', BACKUP)
print('[backup]', BACKUP)

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Correção 1: parsearPlanoTXT - rejeitar linhas com descrição vazia + deduplicar
OLD_1 = """        // Parsear conteúdo TXT (formato IOB/SAGE)
        function parsearPlanoTXT(content) {
            const lines = content.split(/\\r?\\n/).filter(l => l.trim());
            const contasImportadas = [];
            
            lines.forEach(line => {
                const codigo = line.substring(0, 14).trim();
                const descricao = line.substring(40, 77).trim() || line.substring(14, 54).trim();
                const reduzido = line.substring(77).trim() || line.substring(54).trim();
                
                if (codigo && codigo.match(/^\\d/)) {
                    let reduzidoNumero = reduzido;
                    if (reduzido.startsWith('5G')) {
                        const match = reduzido.match(/(\\d+)$/);
                        if (match) reduzidoNumero = match[1];
                    }
                    
                    contasImportadas.push({
                        codigo: codigo,
                        descricao: descricao,
                        reduzido: reduzidoNumero
                    });
                }
            });
            
            return contasImportadas;
        }"""

NEW_1 = """        // v4.3: parsearPlanoTXT com validacao + dedup
        function parsearPlanoTXT(content) {
            const lines = content.split(/\\r?\\n/).filter(l => l.trim());
            const contasImportadas = [];
            const codigosVistos = new Set();
            let rejeitadasVazias = 0;
            let rejeitadasDuplicadas = 0;
            
            lines.forEach(line => {
                const codigo = line.substring(0, 14).trim();
                const descricao = line.substring(40, 77).trim() || line.substring(14, 54).trim();
                const reduzido = line.substring(77).trim() || line.substring(54).trim();
                
                // Validacoes: rejeita linhas com cod invalido, desc vazia, ou duplicadas
                if (!codigo || !codigo.match(/^\\d/)) return;
                if (!descricao || descricao.length < 2) { rejeitadasVazias++; return; }
                if (codigosVistos.has(codigo)) { rejeitadasDuplicadas++; return; }
                codigosVistos.add(codigo);
                
                let reduzidoNumero = reduzido;
                if (reduzido.startsWith('5G')) {
                    const match = reduzido.match(/(\\d+)$/);
                    if (match) reduzidoNumero = match[1];
                }
                
                contasImportadas.push({ codigo, descricao, reduzido: reduzidoNumero });
            });
            
            if (rejeitadasVazias || rejeitadasDuplicadas) {
                console.log('[parser TXT] ' + contasImportadas.length + ' validas, ' +
                    rejeitadasVazias + ' com desc vazia, ' +
                    rejeitadasDuplicadas + ' duplicadas rejeitadas');
            }
            
            return contasImportadas;
        }"""

count = content.count(OLD_1)
if count != 1:
    print('FALHA parsearPlanoTXT: trecho encontrado', count, 'x')
    sys.exit(1)
content = content.replace(OLD_1, NEW_1)
print('[ok] parsearPlanoTXT corrigido')

# Correção 2: parsearPlanoCSV tambem - mesma protecao
OLD_2 = """                if (cols.length >= 2) {
                    const codigo = cols[0];
                    const descricao = cols[1];
                    const reduzido = cols[2] || '';
                    
                    if (codigo && codigo.match(/^\\d/)) {
                        contasImportadas.push({
                            codigo: codigo,
                            descricao: descricao,
                            reduzido: reduzido
                        });
                    }
                }"""

NEW_2 = """                if (cols.length >= 2) {
                    const codigo = cols[0];
                    const descricao = cols[1];
                    const reduzido = cols[2] || '';
                    
                    if (codigo && codigo.match(/^\\d/) && descricao && descricao.trim().length >= 2) {
                        contasImportadas.push({ codigo, descricao, reduzido });
                    }
                }"""

count = content.count(OLD_2)
if count != 1:
    print('FALHA parsearPlanoCSV: trecho encontrado', count, 'x')
    sys.exit(1)
content = content.replace(OLD_2, NEW_2)
print('[ok] parsearPlanoCSV corrigido')

# Correcao 3: finalizarImportacaoPlano - mensagem mais clara
OLD_3 = """                showToast('⏳ Enviando plano para o servidor...', 'success');
                await cadastrarPlanoComCNPJ(nomePlano.trim(), cnpj, contasImportadas);"""

NEW_3 = """                showToast('⏳ Validando e enviando ' + contasImportadas.length + ' contas...', 'success');
                await cadastrarPlanoComCNPJ(nomePlano.trim(), cnpj, contasImportadas);"""

count = content.count(OLD_3)
if count != 1:
    print('AVISO finalizarImportacaoPlano: trecho nao unico (pulando)')
else:
    content = content.replace(OLD_3, NEW_3)
    print('[ok] finalizarImportacaoPlano mensagem melhorada')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('')
print('[sucesso] Patch aplicado')
print('Backup:', BACKUP)
