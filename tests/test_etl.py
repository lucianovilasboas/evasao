"""Synthetic fixtures only; never opens the application's private data."""
import copy
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd
from etl import processar, validacao


def row(campus="OURO BRANCO", situacao="Evasão"):
    return {"Código Curso": "TEST", "Descrição do Curso": "Curso sintético",
            "Modalidade": "Integrado", "Nível de Ensino": "Técnico",
            "Ano de Ingresso": "2025", "Período de Ingresso": "1",
            "Última matrícula em período letivo": "2026.1",
            "Situação no Curso": situacao, "Campus": campus, "Sexo": "Não informado"}


class EtlTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.data = Path(self.tmp.name)
        self.brutos = self.data / "brutos"
        self.brutos.mkdir()

    def sheet(self, name="teste.xlsx", rows=None):
        file = self.brutos / name
        pd.DataFrame(rows or [row()]).to_excel(file, sheet_name="Registros", index=False)
        return str(file)

    def fixture(self, rows=None, classes=None):
        regs, info = processar.processar_planilha(self.sheet(rows=rows), classes)
        meta = processar.montar_meta(regs, info["excluidos"], info["cursos"], ["teste.xlsx"])
        meta["arquivos"] = [{"arquivo": "teste.xlsx", "campi": meta["campi"],
            "estudantes": len(regs), "saidas": sum(r["saida"] for r in regs),
            "excluidos": len(info["excluidos"]), "mapeamentoExplicito": info["explicito"],
            "mapeamento": info["classes"], "pendentes": info["pendentes"],
            "contagemClasses": info["contagemClasses"], "valores": info["valores"]}]
        return regs, meta

    def gate(self, regs, meta):
        with contextlib.redirect_stdout(io.StringIO()):
            return validacao.validar(regs, meta)

    def run_etl(self, selftest=True):
        with patch.object(processar, "BRUTOS", str(self.brutos)), \
             patch.object(processar, "SAIDA", str(self.data)), \
             patch("sys.argv", ["etl.processar"] + (["--selftest"] if selftest else [])), \
             contextlib.redirect_stdout(io.StringIO()):
            return processar.main()

    def test_other_campus_without_ponte_nova_is_valid(self):
        regs, meta = self.fixture()
        self.assertEqual(self.gate(regs, meta), 0)
        self.assertEqual(self.run_etl(), 0)
        self.assertEqual(json.loads((self.data / "meta.json").read_text())["campi"], ["OURO BRANCO"])

    def test_pn_default_keeps_fixed_reference_checks(self):
        regs, meta = self.fixture([row("PONTE NOVA")])
        self.assertEqual(self.gate(regs, meta), 1)  # Not the historical PN dataset.

    def test_pn_default_matching_reference(self):
        regs, meta = self.fixture([row("PONTE NOVA")])
        reference = {"validos": 1, "excluidos": 0,
            "grupos": {"integrados": {"estudantes": 1, "saidas": 1}},
            "serie_anual": {"2025.1": (1, 0), "2026.1": (1, 1)},
            "serie_semestral": {}}
        with patch.object(validacao, "REF", reference):
            self.assertEqual(self.gate(regs, meta), 0)
            reference["serie_anual"]["2026.1"] = (1, 0)
            self.assertEqual(self.gate(regs, meta), 1)

    def test_custom_pn_skips_reference_not_general_checks(self):
        regs, meta = self.fixture([row("PONTE NOVA")], {"Evasão": "nao_saida"})
        self.assertEqual(self.gate(regs, meta), 0)
        meta["validacao"]["validos"] += 1
        self.assertEqual(self.gate(regs, meta), 1)

    def test_multi_campus_without_pn(self):
        regs, meta = self.fixture([row(), row("BETIM", "Matriculado")])
        self.assertEqual(self.gate(regs, meta), 0)
        meta["validacao"]["porCampus"]["BETIM"]["grupos"]["integrados"]["saidas"] = 1
        self.assertEqual(self.gate(regs, meta), 1)

    def test_pending_in_other_campus_fails_even_with_custom_pn(self):
        regs, meta = self.fixture([row("PONTE NOVA"), row("BETIM", "Desconhecido")],
                                  {"Evasão": "evasao"})
        self.assertEqual(self.gate(regs, meta), 1)

    def test_pending_file_metadata_alone_fails(self):
        regs, meta = self.fixture()
        meta["arquivos"][0]["pendentes"] = ["Não classificado"]
        self.assertEqual(self.gate(regs, meta), 1)

    def test_all_pn_sources_are_considered_for_custom_mapping(self):
        self.sheet("a.xlsx", [row("PONTE NOVA")])
        self.sheet("b.xlsx", [row("PONTE NOVA", "Matriculado")])
        (self.data / "mapeamentos.json").write_text(json.dumps({
            "b.xlsx": {"classes": {"Matriculado": "nao_saida"}}}))
        self.assertEqual(self.run_etl(), 0)

    def test_divergent_metadata_is_rejected(self):
        regs, original = self.fixture()
        for section, key, value in [
            ("validacao", "validos", 9), ("validacao", "excluidos", 9),
            (None, "campi", ["BETIM"]),
        ]:
            with self.subTest(key=key):
                meta = copy.deepcopy(original)
                target = meta[section] if section else meta
                target[key] = value
                self.assertEqual(self.gate(regs, meta), 1)
        for key in ("estudantes", "saidas", "excluidos"):
            with self.subTest(file_count=key):
                meta = copy.deepcopy(original)
                meta["arquivos"][0][key] = 99
                self.assertEqual(self.gate(regs, meta), 1)

    def test_record_consistency_is_rejected(self):
        original, meta = self.fixture()
        for key, value in [("saida", False), ("classe", "invalida"),
                           ("periodos", []), ("vinculoPeriodos", 99),
                           ("ultimaMatricula", "2030.1")]:
            with self.subTest(key=key):
                regs = copy.deepcopy(original)
                regs[0][key] = value
                self.assertEqual(self.gate(regs, meta), 1)

    def seed_outputs(self):
        previous = {"base_temporal.json": b'["base anterior"]',
                    "meta.json": b'{"anterior":true}'}
        for name, content in previous.items():
            (self.data / name).write_bytes(content)
        return previous

    def assert_outputs(self, previous):
        for name, content in previous.items():
            self.assertEqual((self.data / name).read_bytes(), content)

    def test_validation_failure_preserves_outputs(self):
        self.sheet(rows=[row("PONTE NOVA")])
        previous = self.seed_outputs()
        self.assertEqual(self.run_etl(), 1)
        self.assert_outputs(previous)

    def test_general_validation_runs_without_selftest(self):
        self.sheet(rows=[row(situacao="Desconhecido")])
        (self.data / "mapeamentos.json").write_text(json.dumps({
            "teste.xlsx": {"classes": {"Evasão": "evasao"}}}))
        previous = self.seed_outputs()
        self.assertEqual(self.run_etl(selftest=False), 1)
        self.assert_outputs(previous)

    def test_empty_explicit_mapping_does_not_fall_back_to_default(self):
        self.sheet()
        (self.data / "mapeamentos.json").write_text(json.dumps({
            "teste.xlsx": {"classes": {}}}))
        previous = self.seed_outputs()
        self.assertEqual(self.run_etl(), 1)
        self.assert_outputs(previous)

    def test_read_failure_preserves_outputs(self):
        self.sheet()
        previous = self.seed_outputs()
        with patch.object(processar, "processar_planilha", side_effect=ValueError("leitura")):
            with self.assertRaises(ValueError):
                self.run_etl()
        self.assert_outputs(previous)

    def test_second_replace_failure_rolls_back_first_output(self):
        self.sheet()
        previous = self.seed_outputs()
        real_replace = os.replace
        failed = False

        def replace(src, dst):
            nonlocal failed
            if str(dst) == str(self.data / "meta.json") and not failed:
                failed = True
                raise OSError("falha sintética na segunda troca")
            return real_replace(src, dst)

        with patch.object(processar.os, "replace", side_effect=replace):
            with self.assertRaises(OSError):
                self.run_etl()
        self.assertTrue(failed)
        self.assert_outputs(previous)
        self.assertEqual(sorted(p.name for p in self.data.iterdir()),
                         ["base_temporal.json", "brutos", "meta.json"])

    def test_custom_other_campus_does_not_disable_pn_reference(self):
        self.sheet("pn.xlsx", [row("PONTE NOVA")])
        self.sheet("outro.xlsx", [row("BETIM")])
        (self.data / "mapeamentos.json").write_text(json.dumps({
            "outro.xlsx": {"classes": {"Evasão": "nao_saida"}}}))
        previous = self.seed_outputs()
        self.assertEqual(self.run_etl(), 1)  # Historical PN counts must still be checked.
        self.assert_outputs(previous)

    def test_multi_campus_with_pn_default_matching_reference(self):
        self.sheet("pn.xlsx", [row("PONTE NOVA")])
        self.sheet("outro.xlsx", [row("BETIM")])
        reference = {"validos": 1, "excluidos": 0,
            "grupos": {"integrados": {"estudantes": 1, "saidas": 1}},
            "serie_anual": {"2025.1": (1, 0), "2026.1": (1, 1)},
            "serie_semestral": {}}
        with patch.object(validacao, "REF", reference):
            self.assertEqual(self.run_etl(), 0)

    def test_serialization_failure_preserves_outputs(self):
        previous = self.seed_outputs()
        with patch.object(processar, "SAIDA", str(self.data)), \
             patch.object(processar.json, "dump", side_effect=TypeError("serialização")):
            with self.assertRaises(TypeError):
                processar.gravar_outputs([], {})
        self.assert_outputs(previous)
        self.assertEqual(sorted(p.name for p in self.data.iterdir()),
                         ["base_temporal.json", "brutos", "meta.json"])

    def test_failed_initial_publication_removes_new_first_output(self):
        self.sheet()
        real_replace = os.replace

        def replace(src, dst):
            if str(dst) == str(self.data / "meta.json"):
                raise OSError("segunda troca")
            return real_replace(src, dst)

        with patch.object(processar.os, "replace", side_effect=replace):
            with self.assertRaises(OSError):
                self.run_etl()
        self.assertFalse((self.data / "base_temporal.json").exists())
        self.assertFalse((self.data / "meta.json").exists())


if __name__ == "__main__":
    unittest.main()
