from textrec.paths import paths
import logging
logging.basicConfig(
    format='%(asctime)s: %(levelname)s: %(name)s: %(message)s',
    level=logging.INFO,
    filename=str(paths.logdir / "server.log"))

from textrec.app import main
main()
