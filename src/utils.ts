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
  // Handle SSH URLs (git@github.com:user/repo.git)
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
