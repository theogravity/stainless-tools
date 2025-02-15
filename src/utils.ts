// Validates domain segments like 'github.com' or 'gitlab.company.com'
export function isValidDomain(domain: string): boolean {
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)*$/;
  return domainPattern.test(domain);
}

// Validates repository path like 'user/repo.git'
export function isValidRepoPath(path: string): boolean {
  const repoPattern = /^[a-zA-Z0-9][-a-zA-Z0-9]*\/[-a-zA-Z0-9_.]+\.git$/;
  return repoPattern.test(path);
}

export function isValidGitUrl(url: string): boolean {
  // Handle SSH URLs with protocol (ssh://git@github.com:443/user/repo.git)
  if (url.startsWith("ssh://")) {
    try {
      const sshUrl = new URL(url);
      const path = sshUrl.pathname.slice(1); // Remove leading slash
      return isValidDomain(sshUrl.hostname) && isValidRepoPath(path);
    } catch {
      return false;
    }
  }

  // Handle traditional SSH URLs (git@github.com:user/repo.git)
  if (url.startsWith("git@")) {
    const [prefix, repoPath] = url.split(":");
    const domain = prefix.slice(4); // Remove 'git@'
    return isValidDomain(domain) && isValidRepoPath(repoPath);
  }

  // Handle HTTPS URLs (https://github.com/user/repo.git)
  try {
    const httpsUrl = new URL(url);
    if (httpsUrl.protocol !== "http:" && httpsUrl.protocol !== "https:") {
      return false;
    }

    // Remove leading slash and validate repository path
    const repoPath = httpsUrl.pathname.slice(1);
    return isValidDomain(httpsUrl.hostname) && isValidRepoPath(repoPath);
  } catch {
    return false;
  }
}

interface GetTargetDirOptions {
  targetDir: string;
  sdkName?: string;
  env?: string;
  branch: string;
}

/**
 * Calculates the target directory path with variable substitutions
 * Replaces {sdk}, {env}, and {branch} placeholders in the target directory path
 */
export function getTargetDir(options: GetTargetDirOptions): string {
  let targetDir = options.targetDir;
  
  if (options.sdkName) {
    targetDir = targetDir.replace("{sdk}", options.sdkName);
  }
  
  if (options.env) {
    targetDir = targetDir.replace("{env}", options.env);
  }
  
  // Convert forward slashes in branch name to hyphens for filesystem compatibility
  const safeBranchName = options.branch.replace(/\//g, "-");
  targetDir = targetDir.replace("{branch}", safeBranchName);
  
  return targetDir;
}
