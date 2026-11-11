"""Minute-grid work/recovery states for one resolved timing policy."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TimingRules:
    initial: int
    max_work: int
    rest: int

    @classmethod
    def from_policy(cls, policy):
        return cls(policy.initial_recovery_minutes, policy.max_work_minutes,
                   policy.between_work_recovery_minutes)

    @property
    def first_work(self):
        return self.initial + 1

    @property
    def first_post_work(self):
        return self.initial + self.max_work + 1

    @property
    def recovered(self):
        return self.first_post_work + self.rest

    @property
    def final_states(self):
        return (self.initial, self.recovered)

    def work_state(self, minutes):
        # Longer observed tours are past facts; they create an immediate rest debt.
        return self.initial + min(minutes, self.max_work)

    def post_work_state(self, cooled_minutes):
        return self.first_post_work + min(cooled_minutes, self.rest)

    def can_work(self, state):
        return (state in self.final_states or
                self.first_work <= state < self.first_post_work - 1)

    def next_state(self, state, work):
        if work:
            if self.can_work(state):
                return self.first_work if state in self.final_states else state + 1
            return None
        if state < self.initial:
            return state + 1
        if state == self.initial or state == self.recovered:
            return state
        if self.first_work <= state < self.first_post_work:
            return self.first_post_work + 1
        if self.first_post_work <= state < self.recovered:
            return state + 1
        return None

    def remaining(self, state):
        if state < self.initial:
            return self.initial - state
        if state in self.final_states:
            return 0
        if self.first_work <= state < self.first_post_work:
            return self.rest
        return self.recovered - state

    def arcs(self):
        return [(state, label, next_state)
                for state in range(self.recovered + 1)
                for label in (0, 1)
                if (next_state := self.next_state(state, label)) is not None]


def lexicographic_weights(horizon=120, tail=120):
    """Useful minutes, changes, early work, and stable worker preference."""
    if not 1 <= horizon <= 120 or not 0 <= tail <= 120:
        raise ValueError('timing grid exceeds supported horizon or tail')
    workers = 11
    stable_bound = horizon * workers * workers
    early_bound = workers * horizon * (horizon + 1) // 2
    changes_bound = workers * (2 * (horizon + tail) - 1)
    stable = 1
    early = stable_bound + 1
    changes = early_bound * early + stable_bound + 1
    useful = changes_bound * changes + early_bound * early + stable_bound + 1
    assert workers * horizon * useful + early_bound * early + stable_bound < 2**63
    return useful, changes, early, stable
