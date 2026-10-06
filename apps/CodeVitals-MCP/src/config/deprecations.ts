import { Severity } from "../types/findings.js";

export interface DeprecatedAPI {
  symbol: string;
  replacement?: string;
  since?: string;
  removedIn?: string;
  severity: Severity;
  message: string;
}

export const KNOWN_DEPRECATIONS: DeprecatedAPI[] = [
  // Node.js & JS/TS
  {
    symbol: "util.print",
    replacement: "console.log",
    since: "v0.11.3",
    removedIn: "v12.0.0",
    severity: "high",
    message: "util.print is deprecated.",
  },
  {
    symbol: "Buffer",
    replacement: "Buffer.alloc or Buffer.from",
    since: "v6.0.0",
    severity: "high",
    message: "Calling Buffer constructor directly is deprecated for security reasons.",
  },
  {
    symbol: "domain",
    replacement: "AsyncLocalStorage / Promise error handling",
    since: "v1.4.0",
    severity: "medium",
    message: "Node.js domain module is deprecated.",
  },
  {
    symbol: "componentWillMount",
    replacement: "componentDidMount or useEffect",
    since: "v16.3.0",
    severity: "high",
    message: "React lifecycle componentWillMount is deprecated.",
  },
  {
    symbol: "componentWillReceiveProps",
    replacement: "getDerivedStateFromProps or useEffect",
    since: "v16.3.0",
    severity: "high",
    message: "React lifecycle componentWillReceiveProps is deprecated.",
  },
  {
    symbol: "ReactDOM.render",
    replacement: "createRoot",
    since: "v18.0.0",
    severity: "medium",
    message: "ReactDOM.render is deprecated in React 18.",
  },
  {
    symbol: "_.pluck",
    replacement: "_.map",
    severity: "low",
    message: "lodash _.pluck is deprecated.",
  },

  // Python Deprecations
  {
    symbol: "asyncio.get_event_loop()",
    replacement: "asyncio.get_running_loop()",
    since: "3.10",
    severity: "medium",
    message: "asyncio.get_event_loop() without running loop is deprecated in Python 3.10+",
  },
  {
    symbol: "import imp",
    replacement: "import importlib",
    since: "3.4",
    removedIn: "3.12",
    severity: "high",
    message: "Python 'imp' module was removed in Python 3.12.",
  },
  {
    symbol: "threading.Thread.isAlive()",
    replacement: "threading.Thread.is_alive()",
    since: "3.8",
    severity: "low",
    message: "isAlive() is deprecated in Python 3.8+.",
  },

  // Go Deprecations
  {
    symbol: "ioutil.ReadFile",
    replacement: "os.ReadFile",
    since: "1.16",
    severity: "medium",
    message: "io/ioutil package is deprecated since Go 1.16.",
  },
  {
    symbol: "ioutil.ReadAll",
    replacement: "io.ReadAll",
    since: "1.16",
    severity: "medium",
    message: "io/ioutil package is deprecated since Go 1.16.",
  },

  // Java Deprecations
  {
    symbol: "Date.getYear()",
    replacement: "Calendar.get(Calendar.YEAR)",
    severity: "medium",
    message: "java.util.Date.getYear() is deprecated.",
  },

  // PHP Deprecations
  {
    symbol: "mysql_connect",
    replacement: "mysqli_connect or PDO",
    severity: "high",
    message: "PHP mysql_* extension was removed in PHP 7.0.",
  },
];
