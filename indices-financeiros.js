(function (root) {
  "use strict";
  const campos = {
    ac: "Ativo circulante",
    rlp: "Realizável a longo prazo",
    ativo: "Ativo total",
    disponivel: "Disponibilidades",
    estoques: "Estoques incluídos no ativo",
    pc: "Passivo circulante",
    pnc: "Passivo não circulante",
    pl: "Patrimônio líquido informado",
    emprestimos: "Empréstimos e financiamentos (CP + LP)",
    receita: "Receita líquida conforme DRE",
    bruto: "Lucro/prejuízo bruto",
    lucro: "Lucro/prejuízo líquido",
  };
  const cnpj = (v) => String(v || "").replace(/\D/g, "");
  function validar(d, empresa) {
    if (!d || cnpj(d.cnpj) !== cnpj(empresa) || cnpj(empresa).length !== 14)
      throw Error("As bases não pertencem à empresa ativa.");
    const data = (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v || "") &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v;
    if (!data(d.inicio) || !data(d.fim) || d.inicio > d.fim)
      throw Error("Informe o período válido dos demonstrativos.");
    if (!String(d.fonte || "").trim())
      throw Error("Informe os demonstrativos usados como fonte.");
    if (
      !d.bases ||
      !Object.keys(campos).some(
        (k) => typeof d.bases[k] === "number" && Number.isFinite(d.bases[k]),
      )
    )
      throw Error("Informe pelo menos uma base numérica.");
    for (const k of Object.keys(campos))
      if (
        d.bases[k] != null &&
        (typeof d.bases[k] !== "number" || !Number.isFinite(d.bases[k]))
      )
        throw Error("Base inválida: " + campos[k]);
    return d;
  }
  function calcular(d, empresa, tipo) {
    validar(d, empresa);
    const b = d.bases,
      linhas = [];
    function item(nome, formula, keys, fn, unidade = "vezes", den) {
      const completas = keys.every(
        (k) => typeof b[k] === "number" && Number.isFinite(b[k]),
      );
      let motivo = !completas
        ? "Base não informada"
        : den && den(b) <= 0
          ? "Denominador nulo ou negativo"
          : "";
      const valor = motivo ? null : fn(b);
      linhas.push({ nome, formula, valor, unidade, motivo });
    }
    const div = (nome, formula, keys, n, dn, p = false) =>
      item(
        nome,
        formula,
        keys,
        (b) => (n(b) / dn(b)) * (p ? 100 : 1),
        p ? "%" : "vezes",
        dn,
      );
    if (tipo === "indice_financeiro") {
      div(
        "Liquidez corrente",
        "AC / PC",
        ["ac", "pc"],
        (b) => b.ac,
        (b) => b.pc,
      );
      div(
        "Liquidez seca",
        "(AC − Estoques) / PC",
        ["ac", "estoques", "pc"],
        (b) => b.ac - b.estoques,
        (b) => b.pc,
      );
      div(
        "Liquidez imediata",
        "Disponibilidades / PC",
        ["disponivel", "pc"],
        (b) => b.disponivel,
        (b) => b.pc,
      );
      div(
        "Liquidez geral",
        "(AC + RLP) / (PC + PNC)",
        ["ac", "rlp", "pc", "pnc"],
        (b) => b.ac + b.rlp,
        (b) => b.pc + b.pnc,
      );
      item(
        "Capital circulante líquido",
        "AC − PC",
        ["ac", "pc"],
        (b) => b.ac - b.pc,
        "R$",
      );
      div(
        "Margem bruta",
        "Resultado bruto / Receita líquida × 100",
        ["bruto", "receita"],
        (b) => b.bruto,
        (b) => b.receita,
        true,
      );
      div(
        "Margem líquida",
        "Resultado líquido / Receita líquida × 100",
        ["lucro", "receita"],
        (b) => b.lucro,
        (b) => b.receita,
        true,
      );
      div(
        "Giro do ativo (saldo final)",
        "Receita líquida / Ativo final",
        ["receita", "ativo"],
        (b) => b.receita,
        (b) => b.ativo,
      );
    } else if (tipo === "indice_endividamento") {
      div(
        "Endividamento geral",
        "(PC + PNC) / Ativo total × 100",
        ["pc", "pnc", "ativo"],
        (b) => b.pc + b.pnc,
        (b) => b.ativo,
        true,
      );
      div(
        "Composição do endividamento",
        "PC / (PC + PNC) × 100",
        ["pc", "pnc"],
        (b) => b.pc,
        (b) => b.pc + b.pnc,
        true,
      );
      div(
        "Capital de terceiros / PL informado",
        "(PC + PNC) / PL informado × 100",
        ["pc", "pnc", "pl"],
        (b) => b.pc + b.pnc,
        (b) => b.pl,
        true,
      );
      div(
        "Dívida financeira / Ativo",
        "Empréstimos e financiamentos / Ativo × 100",
        ["emprestimos", "ativo"],
        (b) => b.emprestimos,
        (b) => b.ativo,
        true,
      );
      div(
        "Solvência geral",
        "Ativo total / (PC + PNC)",
        ["ativo", "pc", "pnc"],
        (b) => b.ativo,
        (b) => b.pc + b.pnc,
      );
      item(
        "Capital de terceiros",
        "PC + PNC",
        ["pc", "pnc"],
        (b) => b.pc + b.pnc,
        "R$",
      );
    } else throw Error("Modelo de índice inválido.");
    const avisos = [
      "Valores do período informado; índices não anualizados. AC: ativo circulante; PC: passivo circulante; PNC: passivo não circulante; RLP: realizável a longo prazo.",
    ];
    if (["ativo", "pc", "pnc", "pl"].every((k) => typeof b[k] === "number")) {
      const dif = Math.round((b.ativo - b.pc - b.pnc - b.pl) * 100) / 100;
      if (Math.abs(dif) > 0.01)
        avisos.push(
          "Ativo menos PC, PNC e PL informado: R$ " +
            dif.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) +
            ". O resultado do período não é incorporado automaticamente ao PL.",
        );
    }
    if (typeof b.pl === "number" && b.pl <= 0)
      avisos.push(
        "Patrimônio líquido nulo ou negativo: razão sobre PL não calculada.",
      );
    if (d.observacoes) avisos.push(d.observacoes);
    return {
      linhas,
      avisos,
      bases: b,
      fonte: d.fonte,
      inicio: d.inicio,
      fim: d.fim,
    };
  }
  const api = { campos, validar, calcular };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CCIIndicesFinanceiros = api;
})(typeof window !== "undefined" ? window : globalThis);
