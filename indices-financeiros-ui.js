(function () {
  "use strict";
  const Core = window.CCIIndicesFinanceiros,
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  let empresa = "",
    selecionada = "";
  const tipos = (t) =>
    ["indice_financeiro", "indice_endividamento"].includes(t);
  function bases(ctx) {
    const id = String(ctx.empresa.cnpj || "").replace(/\D/g, "");
    if (empresa !== id) {
      empresa = id;
      selecionada = "";
    }
    return Object.entries(ctx.config.indicesFinanceiros || {})
      .filter(([, d]) => d && String(d.cnpj || "").replace(/\D/g, "") === id)
      .sort((a, b) => b[0].localeCompare(a[0]));
  }
  function dados(ctx, tipo) {
    const itens = bases(ctx);
    if (!itens.some(([k]) => k === selecionada))
      selecionada = itens[0]?.[0] || "";
    const d = itens.find(([k]) => k === selecionada)?.[1];
    return {
      ctx,
      baseIndices: d,
      indices: d ? Core.calcular(d, ctx.empresa.cnpj, tipo) : null,
      periodo: d ? d.inicio + "_" + d.fim : "sem-base",
      periodoLegivel: d
        ? d.inicio.split("-").reverse().join("/") +
          " a " +
          d.fim.split("-").reverse().join("/")
        : "Bases não informadas",
    };
  }
  function resultado(i) {
    if (i.valor == null) return 'N.D. — ' + i.motivo;
    const numero = i.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    return i.unidade === 'R$' ? 'R$ ' + numero : numero + ' ' + i.unidade;
  }
  function linhas(d) {
    if (!d.indices)
      throw Error(
        "Cadastre as bases dos demonstrativos para gerar o relatório.",
      );
    return d.indices.linhas
      .map((i) => [i.nome, i.formula, resultado(i)])
      .concat(
        [["BASES DO CÁLCULO", "", "Valor em R$"]],
        Object.entries(Core.campos).map(([k, n]) => [
          n,
          ['receita', 'bruto', 'lucro'].includes(k) ? 'Acumulado do período' : 'Saldo final',
          typeof d.indices.bases[k] === "number"
            ? d.indices.bases[k].toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })
            : "Não informada",
        ]),
        [["FONTE", d.indices.fonte, ""]],
        d.indices.avisos.map((a) => ["NOTA", a, ""]),
      );
  }
  function render(d, tipo, refresh) {
    const painel = document.getElementById("rcIndicesControles");
    painel.innerHTML =
      '<div class="rc-field"><label>Demonstrativos da empresa ativa</label><select id="rcIndicesBase">' +
      bases(d.ctx)
        .map(
          ([k, v]) =>
            '<option value="' +
            esc(k) +
            '" ' +
            (k === selecionada ? "selected" : "") +
            ">" +
            esc(v.inicio + " a " + v.fim) +
            "</option>",
        )
        .join("") +
      '</select></div><p>Modelos por empresa e período. As bases informadas não alteram lançamentos nem saldos contábeis.</p><button class="rc-btn light" id="rcIndicesEditar">Conferir / editar bases</button> <button class="rc-btn light" id="rcIndicesNova">Novo período</button>';
    document.getElementById("rcIndicesBase").onchange = (e) => {
      selecionada = e.target.value;
      refresh();
    };
    document.getElementById("rcIndicesEditar").onclick = () =>
      editar(d.ctx, d.baseIndices, refresh);
    document.getElementById("rcIndicesNova").onclick = () =>
      editar(d.ctx, null, refresh);
    document.getElementById("rcStatusPeriodo").textContent =
      "Bases de demonstrativos";
    document.getElementById("rcFechar").style.display = "none";
    document.getElementById("rcReabrir").style.display = "none";
    document.getElementById("rcResumo").innerHTML =
      '<div class="rc-kpi"><small>Empresa</small><strong>' +
      esc(
        d.ctx.empresa.razao_social ||
          d.ctx.empresa.empresa ||
          d.ctx.empresa.cnpj,
      ) +
      '</strong></div><div class="rc-kpi"><small>Período dos demonstrativos</small><strong>' +
      esc(d.periodoLegivel) +
      "</strong></div>";
    document.getElementById("rcAvisos").innerHTML = d.indices
      ? '<div class="rc-alert">' +
        d.indices.avisos.map(esc).join("<br>") +
        "</div>"
      : '<div class="rc-alert">Informe as bases do balancete e da DRE desta empresa. Nenhum valor de outra empresa será usado.</div>';
    document.getElementById("rcTituloTabela").textContent =
      (tipo === "indice_financeiro"
        ? "Índice Financeiro"
        : "Índice de Endividamento") +
      " — " +
      d.periodoLegivel;
    document.getElementById("rcHead").innerHTML =
      "<tr><th>Indicador / base</th><th>Fórmula / origem</th><th>Resultado</th></tr>";
    document.getElementById("rcBody").innerHTML = d.indices
      ? linhas(d)
          .map(
            (row) =>
              "<tr>" +
              row.map((v) => "<td>" + esc(v) + "</td>").join("") +
              "</tr>",
          )
          .join("")
      : '<tr><td colspan="3">Nenhum demonstrativo cadastrado para este modelo.</td></tr>';
  }
  function editar(ctx, original, refresh) {
    const d = original || {
        inicio: "",
        fim: "",
        fonte: "",
        observacoes: "",
        bases: {},
      },
      cnpj = String(ctx.empresa.cnpj);
    const modal = document.createElement("div");
    modal.className = "rc-modal";
    modal.innerHTML =
      '<div class="rc-modal-panel wide" role="dialog" aria-modal="true" aria-label="Bases dos índices"><h3>Bases dos demonstrativos</h3><p>' +
      esc(ctx.empresa.razao_social || ctx.empresa.empresa || cnpj) +
      " — " +
      esc(cnpj) +
      '</p><p>Informe saldos finais do balancete e resultados acumulados da DRE do mesmo período. Use números negativos para prejuízo ou patrimônio líquido negativo. Campo vazio significa não informado.</p><form><div class="rc-controls"><label class="rc-field">Início<input name="inicio" type="date" required value="' +
      esc(d.inicio) +
      '"></label><label class="rc-field">Fim<input name="fim" type="date" required value="' +
      esc(d.fim) +
      '"></label>' +
      Object.entries(Core.campos)
        .map(
          ([k, n]) =>
            '<label class="rc-field">' +
            esc(n) +
            '<input name="' +
            k +
            '" type="number" step="0.01" value="' +
            esc(d.bases[k] ?? "") +
            '"></label>',
        )
        .join("") +
      '</div><label class="rc-field">Fonte dos valores (arquivo, página e contas)<textarea name="fonte" required style="width:100%">' +
      esc(d.fonte) +
      '</textarea></label><label class="rc-field">Observações<textarea name="observacoes" style="width:100%">' +
      esc(d.observacoes || "") +
      '</textarea></label><p data-erro role="alert"></p><div class="rc-modal-actions"><button type="button" class="rc-btn light" data-cancelar>Cancelar</button><button type="submit" class="rc-btn primary">Salvar bases desta empresa</button></div></form></div>';
    document.body.appendChild(modal);
    modal.querySelector("[data-cancelar]").onclick = () => modal.remove();
    modal.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const btn = modal.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        const f = new FormData(e.target),
          base = {
            ...d,
            cnpj,
            inicio: f.get("inicio"),
            fim: f.get("fim"),
            fonte: f.get("fonte"),
            observacoes: f.get("observacoes"),
            bases: {},
            revisadoEm: new Date().toISOString(),
          };
        for (const k of Object.keys(Core.campos)) {
          const v = f.get(k);
          base.bases[k] = v === "" ? null : Number(v);
        }
        Core.validar(base, cnpj);
        const chave = base.inicio + "_" + base.fim;
        if (
          ctx.config.indicesFinanceiros?.[chave] &&
          (!original || chave !== original.inicio + "_" + original.fim)
        )
          throw Error(
            "Este período já existe. Cancele e use Conferir / editar bases no período desejado.",
          );
        await ctx.salvarIndicesFinanceiros(base);
        selecionada = base.inicio + "_" + base.fim;
        modal.remove();
        refresh();
      } catch (err) {
        modal.querySelector("[data-erro]").textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    };
  }
  window.CCIIndicesUI = { tipos, dados, render, linhas };
})();
