#!/usr/bin/env python3
"""
Wrapper script to run mergekit with proper import order and pydantic rebuild.
The pydantic forward reference to torch.Tensor needs torch imported first,
then the model needs to be rebuilt.
"""
import torch  # MUST be imported before mergekit!

# Now import mergekit and rebuild ALL pydantic models that reference torch
from mergekit.architecture import ConfiguredModuleArchitecture, ConfiguredModelArchitecture

# Rebuild all models to resolve forward references to torch.Tensor
ConfiguredModuleArchitecture.model_rebuild()
ConfiguredModelArchitecture.model_rebuild()

# Now run the actual mergekit CLI
from mergekit.scripts.run_yaml import main
import sys

if __name__ == "__main__":
    main()
