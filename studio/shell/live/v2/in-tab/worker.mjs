// The checker's worker. It is handed bytes and answers checks; it fetches nothing. The page that starts it serves this
// file with a policy that forbids every connection, and the WebAssembly module imports no call that could make one.
import { serve } from "./checker.mjs";

serve(self);
