from operation_nexus.infrastructure.settings import Settings


def test_azure_origin_is_normalized_to_v1_surface() -> None:
    settings = Settings(azure_openai_base_url="https://demo.openai.azure.com")
    assert settings.azure_openai_base_url == "https://demo.openai.azure.com/openai/v1/"


def test_azure_v1_url_keeps_trailing_slash() -> None:
    settings = Settings(azure_openai_base_url="https://demo.openai.azure.com/openai/v1")
    assert settings.azure_openai_base_url.endswith("/openai/v1/")
