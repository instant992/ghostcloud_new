# xray-joly Android JNI wrapper

The wrapper builds the Jolymmiles/Xray-core source pin into `libxrayjoly.so`
for all four Android ABIs. It uses the same JNI lifecycle contract as Xray Last,
but exports the separate `GcXrayJolyCore` symbols. The pipeline validates ELF
class/machine, 16 KiB page alignment, required JNI exports, SHA-256 and size
before publication.
