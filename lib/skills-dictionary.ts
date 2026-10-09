/**
 * Kamus skill: nama kanonik + alias.
 * Pencocokan memakai batas kata, jadi "react" tidak akan cocok dengan
 * "reactive" atau "reaction".
 *
 * Cara menambah skill baru: tambahkan entri dengan kunci kanonik
 * (huruf kecil) dan daftar alias. Pastikan alias TIDAK ambigu —
 * misal jangan tambahkan "go" tanpa batas khusus, karena bisa bentrok
 * dengan kata "go" biasa di deskripsi.
 */

export const SKILL_ALIASES: Record<string, string[]> = {
  // ---- Frontend ----
  react: ["react", "react.js", "reactjs", "react js"],
  "next.js": ["next.js", "nextjs", "next js"],
  "react native": ["react native", "react-native", "reactnative"],
  vue: ["vue", "vue.js", "vuejs"],
  angular: ["angular", "angularjs"],
  svelte: ["svelte", "sveltekit"],
  javascript: ["javascript", "js", "es6", "ecmascript"],
  typescript: ["typescript", "ts"],
  html: ["html", "html5"],
  css: ["css", "css3"],
  sass: ["sass", "scss"],
  tailwind: ["tailwind", "tailwindcss", "tailwind css"],
  bootstrap: ["bootstrap"],
  redux: ["redux", "redux toolkit", "rtk"],
  zustand: ["zustand"],
  "react query": ["react query", "tanstack query", "react-query"],
  "material ui": ["material ui", "mui", "material-ui"],
  "shadcn ui": ["shadcn", "shadcn ui", "shadcn/ui"],
  webpack: ["webpack"],
  vite: ["vite"],
  "web accessibility": ["accessibility", "a11y", "wcag"],
  "server side rendering": ["ssr", "server side rendering", "server-side rendering"],
  "progressive web app": ["pwa", "progressive web app"],
  flutter: ["flutter"],
  "android native": ["android", "kotlin", "java android"],
  "ios native": ["ios", "swift", "swiftui"],

  // ---- Backend / bahasa ----
  "node.js": ["node.js", "nodejs", "node js", "node"],
  express: ["express", "express.js", "expressjs"],
  nestjs: ["nestjs", "nest.js", "nest js"],
  php: ["php"],
  laravel: ["laravel"],
  codeigniter: ["codeigniter"],
  symfony: ["symfony"],
  wordpress: ["wordpress"],
  python: ["python"],
  django: ["django"],
  flask: ["flask"],
  fastapi: ["fastapi", "fast api"],
  "ruby on rails": ["ruby on rails", "rails"],
  java: ["java"],
  "spring boot": ["spring boot", "springboot", "spring"],
  "c#": ["c#", "csharp", ".net", "dotnet", "asp.net"],
  golang: ["golang", "go lang"],
  rust: ["rust"],
  kotlin: ["kotlin"],
  "rest api": ["rest api", "restful", "rest-api", "rest", "api development"],
  graphql: ["graphql", "apollo"],
  grpc: ["grpc"],
  websocket: ["websocket", "socket.io", "socketio"],
  "microservices": ["microservices", "microservice", "micro services"],
  "system design": ["system design", "software architecture", "system architecture", "solution architecture"],
  "message queue": ["message queue", "rabbitmq", "sqs", "pub/sub", "pubsub"],
  kafka: ["kafka", "apache kafka"],
  "event driven": ["event driven", "event-driven", "event driven architecture"],

  // ---- Database ----
  postgresql: ["postgresql", "postgres", "psql", "postgre"],
  mysql: ["mysql", "mariadb"],
  mongodb: ["mongodb", "mongo"],
  redis: ["redis"],
  elasticsearch: ["elasticsearch", "elastic search", "opensearch"],
  sqlite: ["sqlite"],
  "sql server": ["sql server", "mssql", "microsoft sql"],
  oracle: ["oracle db", "oracle database", "plsql", "pl/sql"],
  supabase: ["supabase"],
  firebase: ["firebase", "firestore"],
  prisma: ["prisma"],
  "sql query": ["sql", "query optimization", "stored procedure"],

  // ---- Cloud / DevOps ----
  aws: ["aws", "amazon web services"],
  gcp: ["gcp", "google cloud"],
  azure: ["azure", "microsoft azure"],
  docker: ["docker", "containerization", "containerisation"],
  kubernetes: ["kubernetes", "k8s"],
  "ci/cd": ["ci/cd", "cicd", "ci cd", "continuous integration", "continuous delivery", "github actions", "gitlab ci", "jenkins"],
  terraform: ["terraform"],
  nginx: ["nginx"],
  linux: ["linux", "ubuntu", "unix"],
  "server management": ["vps", "server management", "server administration"],
  observability: ["observability", "grafana", "prometheus", "datadog", "monitoring", "logging"],
  git: ["git", "github", "gitlab", "bitbucket", "version control"],
  "load balancing": ["load balancing", "load balancer"],

  // ---- Data / AI ----
  "data analysis": ["data analysis", "data analytics", "analytics"],
  "machine learning": ["machine learning", "ml", "tensorflow", "pytorch"],
  "ai integration": ["openai", "llm", "genai", "generative ai", "ai integration", "langchain"],
  etl: ["etl", "data pipeline", "airflow"],
  "power bi": ["power bi", "tableau", "looker"],

  // ---- QA / Testing ----
  "unit testing": ["unit test", "unit testing", "jest", "vitest", "pytest", "phpunit", "junit"],
  "e2e testing": ["e2e", "end to end testing", "cypress", "playwright", "selenium"],
  "test automation": ["test automation", "automation testing", "qa automation"],
  "manual testing": ["manual testing", "qa engineer", "quality assurance"],

  // ---- Sistem enterprise / ERP (skill, bukan domain) ----
  erp: ["erp", "sap", "oracle erp", "netsuite", "odoo", "microsoft dynamics", "abap"],
  cobol: ["cobol", "mainframe", "as400"],
  salesforce: ["salesforce", "apex", "sfdc"],

  // ---- Praktik / proses ----
  agile: ["agile", "scrum", "kanban", "sprint"],
  jira: ["jira", "trello", "asana", "clickup"],
  "code review": ["code review", "code reviews", "pull request"],
  "technical documentation": ["technical documentation", "documentation", "srs", "brd", "frd"],
  "requirement gathering": ["requirement gathering", "requirement analysis", "user story", "user stories", "business requirement"],
  "uml diagram": ["uml", "uml diagram", "erd", "dfd", "flowchart"],
  "stakeholder management": ["stakeholder management", "stakeholder communication"],
  "team lead": ["team lead", "tech lead", "mentoring", "mentor", "leadership"],
  "project management": ["project management", "project manager"],
  "problem solving": ["problem solving", "problem-solving", "analytical thinking"],
  "communication skill": ["communication skill", "communication skills", "interpersonal skill"],
};

/** Terbalik: alias -> kanonik. Dibuat sekali saat modul dimuat. */
export const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    map.set(canonical, canonical);
    for (const a of aliases) {
      const key = a.toLowerCase().trim();
      if (!map.has(key)) map.set(key, canonical);
    }
  }
  return map;
})();

/** Alias yang sangat umum/ambigu -> butuh syarat tambahan. */
export const AMBIGUOUS_ALIASES = new Set(["go", "r", "c", "ml", "ts", "js", "sql"]);

/** Label tampilan yang lebih rapi untuk nama kanonik. */
export const SKILL_LABELS: Record<string, string> = {
  react: "React",
  "next.js": "Next.js",
  "react native": "React Native",
  "node.js": "Node.js",
  nestjs: "NestJS",
  typescript: "TypeScript",
  javascript: "JavaScript",
  php: "PHP",
  laravel: "Laravel",
  python: "Python",
  django: "Django",
  fastapi: "FastAPI",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis",
  graphql: "GraphQL",
  "rest api": "REST API",
  "ci/cd": "CI/CD",
  aws: "AWS",
  gcp: "GCP",
  "c#": "C#",
  golang: "Go",
  kubernetes: "Kubernetes",
  docker: "Docker",
  tailwind: "Tailwind CSS",
  redux: "Redux",
  "material ui": "Material UI",
  "shadcn ui": "shadcn/ui",
  "unit testing": "Unit Testing",
  "e2e testing": "E2E Testing",
  "system design": "System Design",
  microservices: "Microservices",
  "sql query": "SQL",
  erp: "ERP / SAP",
  cobol: "COBOL / Mainframe",
  salesforce: "Salesforce",
};

export function skillLabel(canonical: string): string {
  return SKILL_LABELS[canonical] ?? canonical.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Daftar semua skill kanonik yang dikenali. */
export function allCanonicalSkills(): string[] {
  return Object.keys(SKILL_ALIASES);
}
