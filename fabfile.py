from fabric import task
from patchwork.transfers import rsync

# from fabric.contrib.project import rsync_project
import subprocess
import os
import pathlib

module_dir = pathlib.Path(__file__).resolve().parent
assert os.getcwd() == str(module_dir)

PATH_ON_REMOTE = "~/code/textrec"
FRONTEND = "src/frontend"
FRONTEND_ON_REMOTE = os.path.join(PATH_ON_REMOTE, FRONTEND)

# env.use_ssh_config = True
my_hosts = ["textrec-aws"]


@task
def git_push(c):
    c.local("git push")


def get_git_version():
    return (
        subprocess.check_output(["git", "describe", "--always"]).decode("utf-8").strip()
    )


@task
def rsync_models(c):
    rsync(
        c, target="~/code/textrec/models/", source="models/", delete=False
    )  # TODO: delete=True


@task
def git_pull(c):
    c.run(f"cd {PATH_ON_REMOTE} && git pull")


@task
def build_frontend(c):
    git_rev = get_git_version()
    open(os.path.join(FRONTEND, ".env"), "w").write(f"REACT_APP_GIT_REV={git_rev}\n")

    # This bug took me a long time to track down:
    # - c.local runs the command in an EMPTY environment (see https://github.com/fabric/fabric/issues/1744)
    # - which lacks a $PATH.
    # - the npm script starts with a shebang, /usr/bin/env node.
    # - env tries to look up 'node' in its path. Since PATH is empty, it falls back on /usr/bin:/bin.
    # - So it fails with "env: node: No such file or directory".
    # - But 'env -i sh' starts a shell, which provides a default PATH, which *does* include /usr/local/bin.
    # - So "node" within that shell succeeds... but env node fails because that PATH is not *exported*.
    # So we need to pass an explicit PATH. Boo.
    c.local(f"cd {FRONTEND} && rm -rf src/old_versions/*")
    c.local(f"cd {FRONTEND} && PATH=/usr/local/bin:/bin:/usr/bin npm run build")
    rsync(
        c,
        target=os.path.join(FRONTEND_ON_REMOTE, "build/"),
        source=os.path.join(FRONTEND, "build/"),
        delete=False,  # TODO: delete=true
    )
    c.local(
        f"cd {FRONTEND} && sentry-cli releases -o kenneth-arnold -p suggestionfrontend new {git_rev}"
    )
    c.local(
        f"cd {FRONTEND} && sentry-cli releases -o kenneth-arnold -p suggestionfrontend files {git_rev} upload-sourcemaps src build"
    )


@task(hosts=my_hosts)
def deploy(c):
    git_push(c)
    # rsync_models(c)
    git_pull(c)
    build_frontend(c)


def get_data():
    subprocess.run(["./scripts/pull-logs"], env=dict(os.environ, SERVER="gcp1"))


def gen_traits(c):
    def traits_flags(traits):
        return " ".join(f"--trait {trait}" for trait in traits)

    NfC_E = traits_flags(["NFC", "Extraversion"])
    c.local(
        f"python -m textrec.gen_personality_inventory {NfC_E} --export-name traitData --out src/frontend/src/TraitData.js"
    )
    NfC_E_DT_O = traits_flags(["NFC", "Extraversion", "Trust", "Openness"])
    c.local(
        f"python -m textrec.gen_personality_inventory {NfC_E_DT_O} --export-name traitData --out src/frontend/src/TraitData_NfCEDTO.js"
    )
    c.local(
        f"python -m textrec.gen_personality_inventory {NfC_E_DT_O} --out data/trait_data.json"
    )

