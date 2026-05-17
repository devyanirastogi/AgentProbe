from .base import BaseAttackGenerator
from .injection import InjectionGenerator
from .boundary import BoundaryGenerator
from .sandbagging import SandbaggingGenerator
from .cascade import CascadeGenerator
from .consistency import ConsistencyGenerator

ALL_GENERATORS = [
    InjectionGenerator,
    BoundaryGenerator,
    SandbaggingGenerator,
    CascadeGenerator,
    ConsistencyGenerator,
]
