# TIER SYSTEM: Currently returns premium for all users. When auth is added,
# get_user_tier will check the user's subscription status.

from dataclasses import dataclass, field

FREE_FUNDS = [
    "VOO", "BND", "VXUS", "SCHD", "SCHF",
    "SCHI", "VTI", "QQQ", "BNDX", "VBR",
]

FREE_FEATURES = [
    "cumulative_chart",
    "annual_returns_chart",
    "basic_stats",
    "pie_chart",
    "rebalance_toggle",
    "dividend_toggle",
    "benchmark_comparison",
]

PREMIUM_FEATURES = [
    *FREE_FEATURES,
    "rolling_returns",
    "periodic_contributions",
    "shareable_links",
    "dividend_breakdown",
    "sortino_ratio",
    "correlation_matrix",
    "drawdown_chart",
    "custom_time_range",
    "export_reports",
]


@dataclass(frozen=True)
class TierConfig:
    name: str
    max_funds_in_portfolio: int
    max_years_history: int
    available_funds: list[str] = field(default_factory=list)
    features: list[str] = field(default_factory=list)

    def has_feature(self, feature_name: str) -> bool:
        return feature_name in self.features

    def is_within_limit(self, limit_name: str, value: int) -> bool:
        limit = getattr(self, limit_name, None)
        if limit is None:
            raise ValueError(f"Unknown limit: {limit_name}")
        return value <= limit


TIERS: dict[str, TierConfig] = {
    "free": TierConfig(
        name="free",
        max_funds_in_portfolio=4,
        max_years_history=15,
        available_funds=FREE_FUNDS,
        features=FREE_FEATURES,
    ),
    "premium": TierConfig(
        name="premium",
        max_funds_in_portfolio=8,
        max_years_history=30,
        available_funds=list(FREE_FUNDS),  # expand when more funds are added
        features=PREMIUM_FEATURES,
    ),
}


def get_user_tier() -> str:
    """Return the current user's tier name. Change this when auth is added."""
    return "premium"


def get_tier() -> TierConfig:
    """FastAPI dependency — inject into route handlers to access the tier config."""
    return TIERS[get_user_tier()]
