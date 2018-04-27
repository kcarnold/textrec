from fabric.api import local, lcd, env, cd, run
from fabric.contrib.project import rsync_project
import subprocess
import os
import pathlib

PATH_ON_REMOTE = '~/code/textrec'
FRONTEND = 'src/frontend'
FRONTEND_ON_REMOTE = os.path.join(PATH_ON_REMOTE, FRONTEND)

env.use_ssh_config = True
env.hosts = [
   'gcp1',
]

def deploy():
    local('git push')
    git_rev = subprocess.check_output(['git', 'describe', '--always']).decode('utf-8').strip()
    open(os.path.join(FRONTEND, '.env'), 'w').write(f'REACT_APP_GIT_REV={git_rev}\n')
    rsync_project(remote_dir='~/code/textrec/models/', local_dir='models/', delete=True)
    with cd('~/code/textrec'):
        run('git pull')
    with lcd(FRONTEND):
        local('rm -rf src/old_versions/*')
        local('npm run build')
    rsync_project(remote_dir=os.path.join(FRONTEND_ON_REMOTE, 'build/'), local_dir=os.path.join(FRONTEND, 'build/'), delete=True)
    # rsync -Pax models/ megacomplete-aws:/home/ubuntu/code/textrec/models/
    with lcd(FRONTEND):
        local(f'sentry-cli releases -o kenneth-arnold -p suggestionfrontend new {git_rev}')
        local(f'sentry-cli releases -o kenneth-arnold -p suggestionfrontend files {git_rev} upload-sourcemaps src build')

def get_data():
    subprocess.run(['./scripts/pull-logs'], env=dict(os.environ, SERVER='gcp1'))
