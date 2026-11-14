/*
The three symbols kernel/type_checker.cpp takes from src/library, which this checker does not link.

`Lean.reduceBool` and `Lean.reduceNat` ask the kernel to run compiled code through the IR interpreter
(library/ir_interpreter.cpp). An export file carries no compiled code, and the axioms that license those reductions
(`Lean.ofReduceBool`, `Lean.trustCompiler`) are outside the set the app admits. So the hook refuses: the kernel throws,
and the declaration is rejected. It can turn an acceptance into a refusal, never the reverse.

`mk_bool_true` and `mk_bool_false` are the constants `Bool.true` and `Bool.false`, as library/util.cpp makes them.
They are reached only after the hook returns, so here they are never reached.
*/
#include "kernel/environment.h"
#include "kernel/kernel_exception.h"
#include "kernel/expr.h"
#include "util/options.h"

namespace lean {
namespace ir {
object * run_boxed_kernel(environment const & env, options const &, name const &, unsigned, object **) {
    throw kernel_exception(env, "Lean.reduceBool and Lean.reduceNat are not supported: this checker links no interpreter");
}
}
expr mk_bool_true() { return mk_constant(name{"Bool", "true"}); }
expr mk_bool_false() { return mk_constant(name{"Bool", "false"}); }
}
