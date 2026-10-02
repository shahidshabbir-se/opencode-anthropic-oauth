import server from "./v1.js"
import { setup } from "./v2.js"

// V1 >= 1.18.29 calls server; V2 calls setup. Neither adapter loads the other host API.
export default { id: "opencode-anthropic-oauth", server, setup }
