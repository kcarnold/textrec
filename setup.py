try:
    from setuptools import setup
except ImportError:
    from distutils.core import setup

setup(
    name="textrec",
    packages=['textrec'],
    package_dir={'': 'src'},
)
