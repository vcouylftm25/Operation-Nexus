"""`operation-nexus` Typer CLI (CONTRACT.md §10): seed / validate / stats.

`validate` never touches Neo4j and must work fully offline. `seed` and
`stats` import settings/the driver lazily (inside the async helpers below),
so `import operation_nexus.cli` never requires a live database or a finished
`infrastructure/settings.py`.
"""

from __future__ import annotations

import asyncio

import typer

from operation_nexus.domain.graph.scenario import validate_scenario
from operation_nexus.infrastructure.neo4j.seeder import (
    EmbeddingProvider,
    ScenarioValidationError,
    load_scenario_from_dir,
    resolve_scenario_dir,
)

app = typer.Typer(
    name="operation-nexus",
    help="Operation Nexus graph CLI — seed, validate and inspect the investigation graph.",
    no_args_is_help=True,
)


@app.command()
def validate(scenario_slug: str) -> None:
    """Validate a scenario directory offline (no database required)."""
    try:
        scenario_dir = resolve_scenario_dir(scenario_slug)
        scenario = load_scenario_from_dir(scenario_dir)
    except (FileNotFoundError, ValueError) as exc:
        typer.secho(f"Could not load scenario {scenario_slug!r}: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc

    errors = validate_scenario(scenario)
    if not errors:
        typer.secho(
            f"OK — {scenario_dir} is valid "
            f"({len(scenario.entities)} entities, {len(scenario.relationships)} relationships, "
            f"{len(scenario.evidence)} evidence/messages, {len(scenario.rounds)} rounds).",
            fg=typer.colors.GREEN,
        )
        return

    typer.secho(f"FAILED — {len(errors)} problem(s) in {scenario_dir}:", fg=typer.colors.RED)
    for error in errors:
        typer.echo(f"  - {error}")
    raise typer.Exit(code=1)


@app.command()
def seed(
    scenario_slug: str,
    embeddings: bool = typer.Option(
        False, "--embeddings", help="Compute and store Evidence/Message embeddings."
    ),
    drop: bool = typer.Option(False, "--drop", help="Wipe the database before seeding."),
) -> None:
    """Seed a scenario into Neo4j: validate -> constraints -> indexes -> nodes
    -> relationships -> evidence -> vector indexes. Idempotent (MERGE on id)."""
    asyncio.run(_seed_async(scenario_slug, embeddings=embeddings, drop=drop))


async def _seed_async(scenario_slug: str, *, embeddings: bool, drop: bool) -> None:
    from operation_nexus.infrastructure.neo4j.driver import create_driver_manager_from_settings
    from operation_nexus.infrastructure.neo4j.seeder import seed_scenario

    try:
        scenario_dir = resolve_scenario_dir(scenario_slug)
        scenario = load_scenario_from_dir(scenario_dir)
    except (FileNotFoundError, ValueError) as exc:
        typer.secho(f"Could not load scenario {scenario_slug!r}: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc

    embedding_provider: EmbeddingProvider | None = None
    if embeddings:
        embedding_provider = _load_embedding_provider()

    driver_manager = create_driver_manager_from_settings()
    try:
        await driver_manager.verify_connectivity()
        report = await seed_scenario(
            scenario,
            driver_manager,
            drop=drop,
            embeddings=embeddings,
            embedding_provider=embedding_provider,
        )
    except ScenarioValidationError as exc:
        typer.secho(str(exc), fg=typer.colors.RED)
        raise typer.Exit(code=1) from exc
    finally:
        await driver_manager.close()

    typer.secho(
        f"Seeded {scenario_dir.name}: {report.entities} entities, "
        f"{report.relationships} relationships, {report.evidence} evidence/messages.",
        fg=typer.colors.GREEN,
    )


def _load_embedding_provider() -> EmbeddingProvider:
    try:
        from operation_nexus.infrastructure.azure_openai import get_embedding_provider
    except ImportError as exc:
        typer.secho(
            "Embeddings requested (--embeddings) but no EmbeddingProvider implementation was "
            "found. Expected operation_nexus.infrastructure.azure_openai to expose "
            "get_embedding_provider().",
            fg=typer.colors.RED,
        )
        raise typer.Exit(code=1) from exc
    return get_embedding_provider()


@app.command()
def stats() -> None:
    """Node/relationship counts per label (or type), per round."""
    asyncio.run(_stats_async())


async def _stats_async() -> None:
    from operation_nexus.infrastructure.neo4j.driver import create_driver_manager_from_settings
    from operation_nexus.infrastructure.neo4j.seeder import collect_stats

    driver_manager = create_driver_manager_from_settings()
    try:
        await driver_manager.verify_connectivity()
        report = await collect_stats(driver_manager)
    finally:
        await driver_manager.close()

    typer.echo("Nodes (labels, visible_from_round, count):")
    for row in sorted(report["nodes"], key=lambda r: (r["labels"], r["round"])):
        labels = "/".join(row["labels"])
        typer.echo(f"  {labels:20} round {row['round']!s:>3}  {row['count']}")

    typer.echo("Relationships (type, visible_from_round, count):")
    for row in sorted(report["relationships"], key=lambda r: (r["type"], r["round"])):
        typer.echo(f"  {row['type']:20} round {row['round']!s:>3}  {row['count']}")


if __name__ == "__main__":
    app()
