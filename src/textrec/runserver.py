from textrec.paths import paths
import logging

logging.basicConfig(
    format="%(asctime)s: %(levelname)s: %(name)s: %(message)s",
    level=logging.DEBUG,
    handlers=[
        logging.FileHandler(str(paths.logdir / "server.log")),
        logging.StreamHandler(),
    ],
)
logging.getLogger("matplotlib").setLevel(logging.INFO)

from textrec.app import main

main()
