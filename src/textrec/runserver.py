from textrec.paths import paths
import logging

logging.basicConfig(
    format='%(asctime)s: %(levelname)s: %(name)s: %(message)s',
    level=logging.INFO,
    handlers=[
        logging.FileHandler(str(paths.logdir / "server.log")),
        logging.StreamHandler()
    ])
from textrec.app import main
main()
